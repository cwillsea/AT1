import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { loadAllPayrollBatches, loadPayrollRules } from "@/lib/payroll-csv-server";
import { loadAplosNames, accountName, fundName } from "@/lib/aplos-lookup";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// One Aplos transaction per pending ACH batch, one expense line per recipient
// (recipient name in Comment). Amounts are negative — money out of the
// register account the import is run against, same as the credit card import.
export async function GET() {
  const rules = await loadPayrollRules();
  const { batches } = loadAllPayrollBatches(rules);

  const [manualMarks, deletedRows, names] = await Promise.all([
    prisma.manualMark.findMany({ where: { source: "payroll" } }),
    prisma.deletedDeposit.findMany({ where: { source: "payroll" } }),
    loadAplosNames(),
  ]);
  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));
  const pending = batches.filter((b) => !manuallyPosted.has(b.id) && !deletedSet.has(b.id));

  if (pending.length === 0) {
    return NextResponse.json({ error: "No pending payroll batches" }, { status: 404 });
  }
  const unmatched = pending.flatMap((b) => b.recipients.filter((r) => r.accountNumber === 0).map((r) => r.name));
  if (unmatched.length > 0) {
    return NextResponse.json({ error: `No rule for: ${[...new Set(unmatched)].join(", ")}` }, { status: 400 });
  }

  const HEADER = ["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Ministry"];
  const rows: (string | number)[][] = [HEADER];

  // Oldest first so the import reads chronologically.
  for (const batch of [...pending].reverse()) {
    const date = fmtDate(batch.effectiveDate);
    batch.recipients.forEach((r, i) => {
      const line = [
        `${r.accountNumber} - ${accountName(names, r.accountNumber)}`,
        fundName(names, r.fundId),
        r.name,
        +(-r.amount).toFixed(2),
        names.tags.get(r.tagId)?.name ?? "",
      ];
      if (i === 0) {
        rows.push([date, `Payroll ${date} (ACH ${batch.trackingId})`, "Payroll", "", line[0], line[1], line[2], line[3], line[4]]);
      } else {
        rows.push(["", "", "", "", line[0], line[1], line[2], line[3], line[4]]);
      }
    });
  }

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aplos-payroll-import-${today}.xlsx"`,
    },
  });
}
