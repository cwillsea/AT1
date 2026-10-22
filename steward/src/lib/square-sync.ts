import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

const SQUARE_DIR = path.resolve(process.cwd(), "..", "square");
const DEPOSITS_DIR = path.join(SQUARE_DIR, "deposits");

// The DB SyncState row is the single source of truth for the watermark.
// When it's missing, callers should fall back to a fixed origin date — do not
// infer the watermark from CSV filenames (CSVs are derived artifacts and may
// be stale or hand-edited).
async function getLastFetchedThrough(): Promise<string | null> {
  const state = await prisma.syncState.findUnique({ where: { source: "square" } });
  return state?.lastFetchedThrough ?? null;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type SquareSyncResult = {
  beginDate: string;
  endDate: string;
  csvWritten: string | null;
  rowCount: number;
  skipped: boolean;
  skipReason?: string;
};

// Runs `node square/index.js` with overridden BEGIN_DATE/END_DATE env vars.
// The script writes a CSV to square/deposits/ and prints "Wrote N entries".
export async function syncSquare(): Promise<SquareSyncResult> {
  const last = await getLastFetchedThrough();
  const endDate = todayLocal();
  // No watermark yet: start from a fixed origin date so first-sync windows are
  // predictable instead of relative-to-today. Bump this when going to prod.
  const DEFAULT_ORIGIN = "2026-05-01";
  // Square does not create a payout record until a day or more after the sales
  // it settles, so a sync ending "today" cannot see the last few days' payouts
  // -- they do not exist yet. Resuming at watermark+1 next time then skips
  // straight past them and they are stranded forever. That is how the
  // 2026-08-13 payout went missing: the 2026-08-13 sync ran at 08:15 before
  // Square had created it, and the next sync began at 2026-08-14.
  //
  // So every sync re-covers the trailing LOOKBACK_DAYS. Overlap is safe:
  // loadAllDeposits keys deposits by payout ID and takes each payout's rows
  // from a single CSV, so a re-fetched payout replaces rather than duplicates.
  const LOOKBACK_DAYS = 7;
  const lookbackBegin = last ? addDaysIso(last, -LOOKBACK_DAYS) : DEFAULT_ORIGIN;
  // ISO dates compare correctly as strings; never reach back before the origin.
  const beginDate = lookbackBegin < DEFAULT_ORIGIN ? DEFAULT_ORIGIN : lookbackBegin;

  // Only bails when the watermark is somehow ahead of today (clock skew, a
  // hand-edited SyncState). A normal run always has work to do now that the
  // window reaches backwards.
  if (beginDate > endDate) {
    return { beginDate, endDate, csvWritten: null, rowCount: 0, skipped: true, skipReason: "already up to date" };
  }

  const expectedCsv = path.join(DEPOSITS_DIR, `${beginDate}_to_${endDate}.csv`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["index.js"], {
      cwd: SQUARE_DIR,
      env: {
        ...process.env,
        BEGIN_DATE: beginDate,
        END_DATE: endDate,
      },
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`square/index.js exited ${code}: ${stderr || "(no stderr)"}`));
    });
  });

  // Discover the actual written file (filename matches our computed dates).
  let rowCount = 0;
  let csvWritten: string | null = null;
  try {
    const stat = statSync(expectedCsv);
    if (stat.isFile()) {
      csvWritten = expectedCsv;
      // Count data rows by counting newlines minus header.
      const { readFileSync } = await import("node:fs");
      const text = readFileSync(expectedCsv, "utf8");
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      rowCount = Math.max(0, lines.length - 1);
    }
  } catch {
    /* file not present — script may have written 0 rows */
  }

  await prisma.syncState.upsert({
    where: { source: "square" },
    create: { source: "square", lastFetchedThrough: endDate, lastSyncAt: new Date() },
    update: { lastFetchedThrough: endDate, lastSyncAt: new Date(), lastError: null },
  });

  return { beginDate, endDate, csvWritten, rowCount, skipped: false };
}
