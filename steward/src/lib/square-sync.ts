import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

const SQUARE_DIR = path.resolve(process.cwd(), "..", "square");
const DEPOSITS_DIR = path.join(SQUARE_DIR, "deposits");

// Find lastFetchedThrough either from DB or, if missing, by scanning filenames
// like "YYYY-MM-DD_to_YYYY-MM-DD.csv" and taking the max end date.
async function getLastFetchedThrough(): Promise<string | null> {
  const state = await prisma.syncState.findUnique({ where: { source: "square" } });
  if (state?.lastFetchedThrough) return state.lastFetchedThrough;

  try {
    const files = readdirSync(DEPOSITS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/.test(f));
    if (files.length === 0) return null;
    const ends = files.map((f) => f.match(/_to_(\d{4}-\d{2}-\d{2})\.csv$/)![1]);
    ends.sort();
    return ends[ends.length - 1];
  } catch {
    return null;
  }
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
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
  const endDate = todayIsoUtc();
  const beginDate = last ? addDaysIso(last, 1) : addDaysIso(endDate, -30);

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
