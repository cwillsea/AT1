import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { getTransfersDir, extractTransferIds, isTransferCsv, stripBom } from "@/lib/subsplash-csv";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Accept Subsplash transfer export CSVs (transfer-<id>.csv — gifts and payments
// combined in one file) or ZIP files containing them. A file is accepted based on
// its header row, not its name. Files are saved into ../subsplash/transfers/
// from the steward project root.
//
// Upload via:
//   const fd = new FormData();
//   for (const file of files) fd.append("files", file);
//   await fetch("/api/subsplash/upload", { method: "POST", body: fd });
// Header-only check: first line of the CSV must carry the combined-export columns.
function looksLikeTransferExport(text: string): boolean {
  const firstLine = stripBom(text).split(/\r?\n|\r/, 1)[0] ?? "";
  const header = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return isTransferCsv(header);
}

export async function POST(request: Request) {
  const dir = getTransfersDir();
  mkdirSync(dir, { recursive: true });

  const form = await request.formData();
  const files = form.getAll("files");

  const written: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const seenTransferIds = new Set<string>();

  for (const f of files) {
    if (!(f instanceof File)) {
      skipped.push({ name: String(f), reason: "not a file" });
      continue;
    }
    const name = f.name;
    const lower = name.toLowerCase();
    const buffer = Buffer.from(await f.arrayBuffer());

    if (lower.endsWith(".zip")) {
      try {
        const zip = new AdmZip(buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          const entryName = path.basename(entry.entryName);
          const lowerEntry = entryName.toLowerCase();
          if (!lowerEntry.endsWith(".csv")) {
            skipped.push({ name: entryName, reason: "not a csv inside zip" });
            continue;
          }
          const data = entry.getData();
          if (!looksLikeTransferExport(data.toString("utf8"))) {
            skipped.push({ name: entryName, reason: "not a Subsplash transfer export (missing Transaction Type / Transfer ID columns)" });
            continue;
          }
          const target = path.join(dir, entryName);
          writeFileSync(target, data);
          written.push(entryName);
          for (const id of extractTransferIds(data.toString("utf8"))) seenTransferIds.add(id);
        }
      } catch (e) {
        skipped.push({ name, reason: `zip parse failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    } else if (lower.endsWith(".csv")) {
      if (!looksLikeTransferExport(buffer.toString("utf8"))) {
        skipped.push({ name, reason: "not a Subsplash transfer export (missing Transaction Type / Transfer ID columns)" });
        continue;
      }
      const target = path.join(dir, name);
      writeFileSync(target, buffer);
      written.push(name);
      for (const id of extractTransferIds(buffer.toString("utf8"))) seenTransferIds.add(id);
    } else {
      skipped.push({ name, reason: "not a csv or zip" });
    }
  }

  // Reuploading a transfer's CSV should bring it back if it was previously
  // soft-deleted. Clear stale DeletedDeposit marks for the transfers we just wrote,
  // otherwise the card stays hidden even though its data is present again.
  let restored = 0;
  if (seenTransferIds.size > 0) {
    const result = await prisma.deletedDeposit.deleteMany({
      where: {
        source: "subsplash",
        externalKey: { in: [...seenTransferIds].map((id) => `subsplash:${id}`) },
      },
    });
    restored = result.count;
  }

  return Response.json({ written, skipped, restored });
}
