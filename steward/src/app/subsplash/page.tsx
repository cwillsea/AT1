import path from "node:path";
import { SourceChip } from "@/components/SourceChip";
import { TransferList } from "@/components/TransferList";
import { SubsplashUploader } from "@/components/SubsplashUploader";
import { InPersonUploader } from "@/components/InPersonUploader";
import { InPersonBatchList } from "@/components/InPersonBatchList";
import { SubsplashTabs } from "@/components/SubsplashTabs";
import { fmtUSD } from "@/lib/fmt";
import { loadAllTransfers, getTransfersDir } from "@/lib/subsplash-csv";
import { loadAllBatches, getInPersonDir } from "@/lib/in-person-csv";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SubsplashPage() {
  let transfers: ReturnType<typeof loadAllTransfers>["transfers"] = [];
  let csvPaths: string[] = [];
  let loadError: string | null = null;
  try {
    const result = loadAllTransfers();
    transfers = result.transfers;
    csvPaths = result.csvPaths;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  const inPerson = loadAllBatches();
  const batches = inPerson.batches;

  const [manualMarks, deletedRows, inPersonMarks, inPersonDeleted, giftRules, paymentRules, purposes, accounts, funds, tags] = await Promise.all([
    prisma.manualMark.findMany({ where: { source: "subsplash" } }),
    prisma.deletedDeposit.findMany({ where: { source: "subsplash" } }),
    prisma.manualMark.findMany({ where: { source: "in-person" } }),
    prisma.deletedDeposit.findMany({ where: { source: "in-person" } }),
    prisma.categorizationRule.findMany({ where: { source: "subsplash-gift" } }),
    prisma.categorizationRule.findMany({ where: { source: "subsplash-payment" } }),
    prisma.purpose.findMany(),
    prisma.account.findMany(),
    prisma.fund.findMany(),
    prisma.tag.findMany(),
  ]);

  const purposeById = new Map(purposes.map((p) => [p.id, p.name]));
  const giftFundToPurpose = new Map(
    giftRules
      .filter((r) => r.purposeId !== null)
      .map((r) => [r.pattern, purposeById.get(r.purposeId!) ?? null])
  );

  type PaymentTarget = { accountNumber: number; fundId: number; tagId: number };
  const paymentSourceToTarget = new Map<string, PaymentTarget>(
    paymentRules
      .filter((r) => r.accountNumber && r.fundId && r.tagId)
      .map((r) => [r.pattern, { accountNumber: r.accountNumber!, fundId: r.fundId!, tagId: r.tagId! }])
  );

  const names = {
    accounts: Object.fromEntries(accounts.map((a) => [a.accountNumber, a.name])),
    funds: Object.fromEntries(funds.map((f) => [f.id, f.name])),
    tags: Object.fromEntries(tags.map((t) => [t.id, t.name])),
  };
  const manuallyPosted = new Set(manualMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const deletedSet = new Set(deletedRows.map((r) => r.externalKey));
  const inPersonPosted = new Set(inPersonMarks.filter((m) => m.marked).map((m) => m.externalKey));
  const inPersonDeletedSet = new Set(inPersonDeleted.map((r) => r.externalKey));

  const totalNet = transfers.reduce((s, t) => s + t.transferAmount, 0);
  const totalGifts = transfers.reduce((s, t) => s + t.giftCount, 0);
  const totalPayments = transfers.reduce((s, t) => s + t.paymentCount, 0);
  const inPersonTotal = batches.reduce((s, b) => s + b.totalGross, 0);
  const inPersonGiftCount = batches.reduce((s, b) => s + b.giftCount, 0);
  const onlineDirHint = path.relative(path.resolve(process.cwd(), ".."), getTransfersDir());
  const inPersonDirHint = path.relative(path.resolve(process.cwd(), ".."), getInPersonDir());

  const giftFundToPurposeObj = Object.fromEntries(giftFundToPurpose);
  const paymentSourceToTargetObj = Object.fromEntries(paymentSourceToTarget);

  const onlinePanel = (
    <div className="flex flex-col gap-3.5">
      <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 grid grid-cols-[auto_1fr] gap-4 items-center">
        <SourceChip src="subsplash" />
        <div className="font-ui text-[12.5px] text-ink2 leading-normal">
          Each Subsplash transfer becomes one bank deposit. We split it into two posts to Aplos:{" "}
          <strong>gifts</strong> become a <em>contribution batch</em> (purpose-aware, donor-grouped), and{" "}
          <strong>payments</strong> (events, classes, merch) become a <em>register transaction</em> with
          split lines per payment source.
        </div>
      </div>

      <SubsplashUploader />

      {loadError && (
        <div className="bg-clay-soft border border-clay/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
          <strong>Could not load transfers:</strong> {loadError}
        </div>
      )}

      {!loadError && transfers.length === 0 && (
        <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
          No transfers yet. Drop gifts-*.csv / payments-*.csv files (or a zip containing them) into the
          uploader above. Files are saved to <span className="font-mono">{onlineDirHint}/</span>.
        </div>
      )}

      <TransferList
        transfers={transfers}
        initialMarkedKeys={[...manuallyPosted]}
        initialDeletedKeys={[...deletedSet]}
        giftFundToPurpose={giftFundToPurposeObj}
        paymentSourceToTarget={paymentSourceToTargetObj}
        names={names}
      />
    </div>
  );

  const inPersonPanel = (
    <div className="flex flex-col gap-3.5">
      <div className="bg-panel border border-line rounded-xl px-[18px] py-3.5 grid grid-cols-[auto_1fr] gap-4 items-center">
        <SourceChip src="subsplash" />
        <div className="font-ui text-[12.5px] text-ink2 leading-normal">
          Each in-person <strong>contribution batch</strong> CSV (one per Sunday, exported from Subsplash)
          posts to Aplos as a single contribution batch. Gross equals net since there are no Subsplash
          fees on cash/check gifts. The <em>Fund</em> column resolves to Aplos <em>purposes</em> via the
          same <strong>Subsplash-gift</strong> rules as Online Giving — items like
          {" "}<span className="font-mono">NextGen Ministries</span> route through their purpose mapping.
        </div>
      </div>

      <InPersonUploader />

      {batches.length === 0 && (
        <div className="bg-honey-soft border border-honey/30 rounded-xl px-[18px] py-3.5 font-ui text-[12.5px] text-ink2">
          No batches yet. Drop a Subsplash contribution-batch CSV into the uploader above. Files are
          saved to <span className="font-mono">{inPersonDirHint}/</span>.
        </div>
      )}

      <InPersonBatchList
        batches={batches}
        initialMarkedKeys={[...inPersonPosted]}
        initialDeletedKeys={[...inPersonDeletedSet]}
        giftFundToPurpose={giftFundToPurposeObj}
      />
    </div>
  );

  return (
    <>
      <div className="flex items-end justify-between px-8 pt-6 pb-5 border-b border-line">
        <div>
          <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
            Subsplash imports
          </div>
          <div className="font-display text-[28px] text-ink font-medium tracking-tight">
            Subsplash → Aplos
          </div>
          <div className="font-ui text-[11.5px] text-ink3 mt-1.5">
            Online: {csvPaths.length} CSV from <span className="font-mono">{onlineDirHint}/</span> ·
            In-person: {inPerson.csvPaths.length} CSV from <span className="font-mono">{inPersonDirHint}/</span>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">online</div>
            <div className="font-display text-[16px] text-ink mt-0.5 font-medium">
              {transfers.length} transfer{transfers.length === 1 ? "" : "s"} · {totalGifts} gifts · {totalPayments} payments
            </div>
            <div className="font-ui text-[10.5px] text-forest">net {fmtUSD(totalNet, { sign: true })}</div>
          </div>
          <div className="w-px h-8 bg-line" />
          <div className="text-right">
            <div className="font-ui text-[10.5px] text-ink3 tracking-[0.06em] uppercase">in-person</div>
            <div className="font-display text-[16px] text-ink mt-0.5 font-medium">
              {batches.length} batch{batches.length === 1 ? "" : "es"} · {inPersonGiftCount} gifts
            </div>
            <div className="font-ui text-[10.5px] text-forest">gross {fmtUSD(inPersonTotal, { sign: true })}</div>
          </div>
        </div>
      </div>

      <div className="px-8 py-5">
        <SubsplashTabs
          online={onlinePanel}
          inPerson={inPersonPanel}
          onlineCount={transfers.filter((t) => !manuallyPosted.has(`subsplash:${t.id}`) && !deletedSet.has(`subsplash:${t.id}`)).length}
          inPersonCount={batches.filter((b) => !inPersonPosted.has(`in-person:${b.id}`) && !inPersonDeletedSet.has(`in-person:${b.id}`)).length}
        />
      </div>
    </>
  );
}
