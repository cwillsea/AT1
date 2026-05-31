import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { loadAllDeposits } from "@/lib/square-csv-server";
import { loadAplosNames } from "@/lib/aplos-lookup";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export async function GET() {
  const rawRules = await prisma.categorizationRule.findMany({ where: { source: "square" } });
  const rules = rawRules
    .filter((r) => r.accountNumber != null && r.fundId != null && r.tagId != null)
    .map((r) => ({ ...r, accountNumber: r.accountNumber!, fundId: r.fundId!, tagId: r.tagId! }));

  let deposits;
  try {
    ({ deposits } = loadAllDeposits(rules));
  } catch {
    return NextResponse.json({ error: "No Square CSVs found" }, { status: 404 });
  }

  const [manualMarks, deletedRows, aplosNames] = await Promise.all([
    prisma.manualMark.findMany({ where: { source: "square" } }),
    prisma.deletedDeposit.findMany({ where: { source: "square" } }),
    loadAplosNames(),
  ]);

  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));

  const pending = deposits.filter((d) => !manuallyPosted.has(d.id) && !deletedSet.has(d.id));

  const HEADER = ["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Ministry"];
  const rows: string[][] = [HEADER];

  for (const deposit of pending) {
    const date = deposit.date;

    deposit.rollup.forEach((split, i) => {
      const accountLabel = `${split.accountNumber} - ${aplosNames.accounts.get(split.accountNumber)?.name ?? `Account ${split.accountNumber}`}`;
      const fund = aplosNames.funds.get(split.fundId) ?? `Fund ${split.fundId}`;
      const tag = aplosNames.tags.get(split.tagId)?.name ?? "";
      const amount = split.amount.toFixed(2);

      if (i === 0) {
        rows.push([fmtDate(date), `Square Payout ${fmtDate(date)}`, "Square", "", accountLabel, fund, "", amount, tag]);
      } else {
        rows.push(["", "", "", "", accountLabel, fund, "", amount, tag]);
      }
    });

    rows.push(["", "", "", "", "5361 - Square Fees", "General Fund", "", `-${deposit.totalFees.toFixed(2)}`, "General"]);
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
      "Content-Disposition": `attachment; filename="aplos-import-${today}.xlsx"`,
    },
  });
}
