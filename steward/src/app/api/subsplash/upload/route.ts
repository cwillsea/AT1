import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { getTransfersDir } from "@/lib/subsplash-csv";

export const dynamic = "force-dynamic";

// Accept either CSV files (gifts-*.csv, payments-*.csv) or ZIP files containing
// CSVs. Files are saved into ../subsplash/transfers/ from the steward project root.
//
// Upload via:
//   const fd = new FormData();
//   for (const file of files) fd.append("files", file);
//   await fetch("/api/subsplash/upload", { method: "POST", body: fd });
export async function POST(request: Request) {
  const dir = getTransfersDir();
  mkdirSync(dir, { recursive: true });

  const form = await request.formData();
  const files = form.getAll("files");

  const written: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

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
          // Sanity: only accept files that look like Subsplash exports
          if (!/^(gifts|payments)/i.test(entryName)) {
            skipped.push({ name: entryName, reason: "filename doesn't start with gifts/payments" });
            continue;
          }
          const target = path.join(dir, entryName);
          writeFileSync(target, entry.getData());
          written.push(entryName);
        }
      } catch (e) {
        skipped.push({ name, reason: `zip parse failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    } else if (lower.endsWith(".csv")) {
      if (!/^(gifts|payments)/i.test(name)) {
        skipped.push({ name, reason: "filename doesn't start with gifts/payments" });
        continue;
      }
      const target = path.join(dir, name);
      writeFileSync(target, buffer);
      written.push(name);
    } else {
      skipped.push({ name, reason: "not a csv or zip" });
    }
  }

  return Response.json({ written, skipped });
}
