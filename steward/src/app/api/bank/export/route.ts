import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { loadAplosNames } from "@/lib/aplos-lookup";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// Stream an Aplos GL import .xlsx of bank entries that are:
//   - not auto-skipped
//   - not marked as manually entered (ManualMark source="bank")
//   - not soft-deleted (DeletedDeposit source="bank")
//   - fully categorized (account, fund, tag all set)
//
// Each BankEntry becomes one Aplos register row (no splits — bank entries
// are single-line for v1). Sign is preserved: checks/debits stay negative.
export async function GET() {
  const [entries, manualMarks, deleted, aplosNames] = await Promise.all([
    prisma.bankEntry.findMany({ orderBy: [{ date: "asc" }, { kind: "asc" }] }),
    prisma.manualMark.findMany({ where: { source: "bank" } }),
    prisma.deletedDeposit.findMany({ where: { source: "bank" } }),
    loadAplosNames(),
  ]);

  const enteredSet = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deleted.map((d) => d.externalKey));

  const ready = entries.filter((e) =>
    !enteredSet.has(e.externalKey) &&
    !deletedSet.has(e.externalKey) &&
    e.accountNumber != null && e.fundId != null && e.tagId != null,
  );

  const HEADER = ["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Ministry"];
  const rows: string[][] = [HEADER];

  for (const e of ready) {
    const account = `${e.accountNumber} - ${aplosNames.accounts.get(e.accountNumber!)?.name ?? `Account ${e.accountNumber}`}`;
    const fund = aplosNames.funds.get(e.fundId!) ?? `Fund ${e.fundId}`;
    const tag = aplosNames.tags.get(e.tagId!)?.name ?? "";
    rows.push([
      fmtDate(e.date),
      e.description,
      e.kind === "check" ? "" : "",
      e.checkNumber != null ? String(e.checkNumber) : "",
      account,
      fund,
      "",
      e.amount.toFixed(2),
      tag,
    ]);
  }

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aplos-bank-import-${today}.xlsx"`,
    },
  });
}
