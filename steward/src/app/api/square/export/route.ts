import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadAllDeposits } from "@/lib/square-csv-server";
import { loadAplosNames } from "@/lib/aplos-lookup";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function csvField(val: string) {
  return val.includes(",") || val.includes('"') || val.includes("\n")
    ? `"${val.replace(/"/g, '""')}"`
    : val;
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
  const rows = [HEADER.join(",")];

  for (const deposit of pending) {
    const [date] = deposit.id.split(":");

    deposit.rollup.forEach((split, i) => {
      const accountLabel = csvField(`${split.accountNumber} - ${aplosNames.accounts.get(split.accountNumber)?.name ?? `Account ${split.accountNumber}`}`);
      const fund = csvField(aplosNames.funds.get(split.fundId) ?? `Fund ${split.fundId}`);
      const tag = csvField(aplosNames.tags.get(split.tagId)?.name ?? "");
      const amount = split.amount.toFixed(2);

      if (i === 0) {
        rows.push([fmtDate(date), csvField(`Square Payout ${fmtDate(date)}`), "Square", "", accountLabel, fund, "", amount, tag].join(","));
      } else {
        rows.push(["", "", "", "", accountLabel, fund, "", amount, tag].join(","));
      }
    });

    rows.push(["", "", "", "", "5361 - Square Fees", "General Fund", "", `-${deposit.totalFees.toFixed(2)}`, "General"].join(","));
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="aplos-import-${today}.xlsx"`,
    },
  });
}
