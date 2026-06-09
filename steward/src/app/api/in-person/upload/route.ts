import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { getInPersonDir } from "@/lib/in-person-csv";

export const dynamic = "force-dynamic";

// In-person Subsplash contribution-batch CSVs land in ../subsplash/in-person/.
// Accepts .csv files or a .zip containing CSVs.
export async function POST(request: Request) {
  const dir = getInPersonDir();
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
          if (!entryName.toLowerCase().endsWith(".csv")) {
            skipped.push({ name: entryName, reason: "not a csv inside zip" });
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
      const target = path.join(dir, name);
      writeFileSync(target, buffer);
      written.push(name);
    } else {
      skipped.push({ name, reason: "not a csv or zip" });
    }
  }

  return Response.json({ written, skipped });
}
