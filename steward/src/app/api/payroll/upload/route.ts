import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getPayrollDir } from "@/lib/payroll-csv-server";
import { looksLikePayrollCsv, parsePayrollCsv } from "@/lib/payroll-csv";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Accepts Truist ACH payroll CSV exports and saves them into ../payroll/batches/.
//
// Upload via:
//   const fd = new FormData();
//   for (const file of files) fd.append("files", file);
//   await fetch("/api/payroll/upload", { method: "POST", body: fd });
export async function POST(request: Request) {
  const dir = getPayrollDir();
  mkdirSync(dir, { recursive: true });

  const form = await request.formData();
  const files = form.getAll("files");

  const written: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const seenKeys = new Set<string>();

  for (const f of files) {
    if (!(f instanceof File)) {
      skipped.push({ name: String(f), reason: "not a file" });
      continue;
    }
    if (!f.name.toLowerCase().endsWith(".csv")) {
      skipped.push({ name: f.name, reason: "not a csv" });
      continue;
    }
    const text = await f.text();
    if (!looksLikePayrollCsv(text)) {
      skipped.push({ name: f.name, reason: "missing Tracking ID / Recipient Name columns" });
      continue;
    }
    writeFileSync(path.join(dir, path.basename(f.name)), text);
    written.push(f.name);
    for (const b of parsePayrollCsv(text)) seenKeys.add(b.id);
  }

  // Re-uploading a batch should bring it back if it was soft-deleted.
  let restored = 0;
  if (seenKeys.size > 0) {
    const result = await prisma.deletedDeposit.deleteMany({
      where: { source: "payroll", externalKey: { in: [...seenKeys] } },
    });
    restored = result.count;
  }

  return Response.json({ written, skipped, restored });
}
