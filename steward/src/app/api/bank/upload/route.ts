import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { parseStatementBuffer, externalKeyFor } from "@/lib/bank-statement";

export const dynamic = "force-dynamic";

// Where uploaded PDFs are persisted, relative to the steward project root.
//   <project root>/../bank-statements/
function getStatementsDir() {
  return path.resolve(process.cwd(), "..", "bank-statements");
}

// Accept a single PDF (or multiple) under the field name "files".
// Each PDF is saved to ../bank-statements/, parsed, and the parsed
// entries are upserted into BankEntry.
export async function POST(request: Request) {
  const dir = getStatementsDir();
  mkdirSync(dir, { recursive: true });

  const form = await request.formData();
  const files = form.getAll("files");

  const written: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const stats: Array<{ file: string; statementMonth: string; checks: number; debits: number; credits: number; warnings: string[] }> = [];

  for (const f of files) {
    if (!(f instanceof File)) {
      skipped.push({ name: String(f), reason: "not a file" });
      continue;
    }
    const name = f.name;
    if (!name.toLowerCase().endsWith(".pdf")) {
      skipped.push({ name, reason: "not a pdf" });
      continue;
    }
    const buffer = Buffer.from(await f.arrayBuffer());
    const target = path.join(dir, name);
    writeFileSync(target, buffer);
    written.push(name);

    let parsed;
    try {
      parsed = await parseStatementBuffer(buffer);
    } catch (e) {
      skipped.push({ name, reason: `parse failed: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    if (parsed.summary) {
      await prisma.bankStatement.upsert({
        where: { statementMonth: parsed.statementMonth },
        create: {
          statementMonth: parsed.statementMonth,
          statementFile: name,
          beginningBalance: parsed.summary.beginningBalance,
          totalAdditions: parsed.summary.totalAdditions,
          totalSubtractions: parsed.summary.totalSubtractions,
          endingBalance: parsed.summary.endingBalance,
        },
        update: {
          statementFile: name,
          beginningBalance: parsed.summary.beginningBalance,
          totalAdditions: parsed.summary.totalAdditions,
          totalSubtractions: parsed.summary.totalSubtractions,
          endingBalance: parsed.summary.endingBalance,
        },
      });
    }

    let checks = 0, debits = 0, credits = 0;
    let idx = 0;
    for (const entry of parsed.entries) {
      const externalKey = externalKeyFor(parsed.statementMonth, entry, idx++);
      if (entry.kind === "check") checks++;
      else if (entry.kind === "debit") debits++;
      else credits++;

      await prisma.bankEntry.upsert({
        where: { externalKey },
        create: {
          externalKey,
          statementFile: name,
          kind: entry.kind,
          date: entry.date,
          amount: entry.amount,
          description: entry.description,
          checkNumber: entry.checkNumber ?? null,
          autoSkip: false,
        },
        // On re-upload, refresh the parsed fields but preserve the user's
        // chosen account/fund/tag (so re-importing doesn't wipe categorization).
        update: {
          statementFile: name,
          date: entry.date,
          amount: entry.amount,
          description: entry.description,
          checkNumber: entry.checkNumber ?? null,
        },
      });
    }

    stats.push({ file: name, statementMonth: parsed.statementMonth, checks, debits, credits, warnings: parsed.warnings });
  }

  return Response.json({ written, skipped, stats });
}
