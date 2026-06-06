import { SourceChip } from "@/components/SourceChip";
import { BankUploader } from "@/components/BankUploader";
import { BankEntryList } from "@/components/BankEntryList";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BankPage() {
  const [entries, statements, manualMarks, deletedRows, accounts, funds, tags] = await Promise.all([
    prisma.bankEntry.findMany({ orderBy: [{ date: "asc" }, { checkNumber: "asc" }] }),
    prisma.bankStatement.findMany(),
    prisma.manualMark.findMany({ where: { source: "bank" } }),
    prisma.deletedDeposit.findMany({ where: { source: "bank" } }),
    prisma.account.findMany({ where: { isEnabled: true } }),
    prisma.fund.findMany(),
    prisma.tag.findMany(),
  ]);

  const summariesByMonth = Object.fromEntries(
    statements.map((s) => [
      s.statementMonth,
      {
        beginningBalance: s.beginningBalance,
        totalAdditions: s.totalAdditions,
        totalSubtractions: s.totalSubtractions,
        endingBalance: s.endingBalance,
      },
    ]),
  );

  const marked = manualMarks.filter((m) => m.marked).map((m) => m.externalKey);
  const deletedKeys = deletedRows.map((r) => r.externalKey);

  const names = {
    accounts: Object.fromEntries(accounts.map((a) => [a.accountNumber, a.name])),
    funds: Object.fromEntries(funds.map((f) => [f.id, f.name])),
    tags: Object.fromEntries(tags.map((t) => [t.id, t.name])),
  };

  const accountOpts = accounts.map((a) => ({ number: a.accountNumber, name: a.name, category: a.category }));
  const fundOpts = funds.map((f) => ({ id: f.id, name: f.name }));
  const tagOpts = tags.map((t) => ({ id: t.id, name: t.name, category: t.category }));

  const visibleEntries = entries.filter((e) => !deletedKeys.includes(e.externalKey));

  // externalKey shape is "bank:<Month Year>:<kind>:..." — pull the month label out.
  const statementMonthOf = (externalKey: string): string => externalKey.split(":")[1] ?? "Unknown";

  const statementFiles = Array.from(new Set(entries.map((e) => e.statementFile)));

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Bank reconciliation
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Bank statement → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            {statementFiles.length === 0
              ? "No statements uploaded yet"
              : `Parsed ${statementFiles.length} statement${statementFiles.length === 1 ? "" : "s"} · ${entries.length} entries on file`}
          </div>
        </div>
        <a
          href="/api/bank/export"
          className="px-3.5 py-2 rounded-full bg-forest text-bg font-ui text-[12px] font-semibold cursor-pointer"
        >
          Generate Aplos import
        </a>
      </div>

      <div className="px-8 py-5 flex flex-col gap-3.5">
        <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 grid grid-cols-[auto_1fr] gap-4 items-center">
          <SourceChip src="truist" />
          <div className="font-ui text-[12.5px] text-ink2 leading-normal">
            Drop a bank statement PDF. We split it into <strong>checks</strong>, <strong>debits</strong>, and{" "}
            <strong>credits</strong>. Mark anything already entered in Aplos with the <em>Entered</em> checkbox.
            For the rest, pick account / fund / ministry and click <strong>Generate Aplos import</strong> to
            download an .xlsx of just the ready rows.
          </div>
        </div>

        <BankUploader />

        <BankEntryList
          entries={visibleEntries.map((e) => ({
            externalKey: e.externalKey,
            statementMonth: statementMonthOf(e.externalKey),
            kind: e.kind as "check" | "debit" | "credit",
            date: e.date,
            amount: e.amount,
            description: e.description,
            checkNumber: e.checkNumber,
            accountNumber: e.accountNumber,
            fundId: e.fundId,
            tagId: e.tagId,
          }))}
          initialMarkedKeys={marked}
          initialDeletedKeys={deletedKeys}
          accounts={accountOpts}
          funds={fundOpts}
          tags={tagOpts}
          names={names}
          summariesByMonth={summariesByMonth}
        />
      </div>
    </>
  );
}
