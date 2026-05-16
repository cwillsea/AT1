import { prisma } from "@/lib/db";
import { RulesTabs } from "@/components/RulesTabs";
import { loadAllTransfers } from "@/lib/subsplash-csv";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const [
    squareRules,
    subsplashGiftRules,
    subsplashPaymentRules,
    accounts,
    funds,
    tags,
    purposes,
  ] = await Promise.all([
    prisma.categorizationRule.findMany({
      where: { source: "square" },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
    prisma.categorizationRule.findMany({
      where: { source: "subsplash-gift" },
      orderBy: [{ pattern: "asc" }],
    }),
    prisma.categorizationRule.findMany({
      where: { source: "subsplash-payment" },
      orderBy: [{ pattern: "asc" }],
    }),
    prisma.account.findMany({ orderBy: { accountNumber: "asc" } }),
    prisma.fund.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.purpose.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Discover Subsplash sources from CSV files (so the editor can flag missing rules).
  let observedGiftFunds: string[] = [];
  let observedPaymentSources: string[] = [];
  try {
    const { transfers } = loadAllTransfers();
    const giftFunds = new Set<string>();
    const paymentSources = new Set<string>();
    for (const t of transfers) {
      for (const g of t.gifts) if (g.fund) giftFunds.add(g.fund);
      for (const p of t.payments) if (p.paymentSource) paymentSources.add(p.paymentSource);
    }
    observedGiftFunds = [...giftFunds].sort();
    observedPaymentSources = [...paymentSources].sort();
  } catch {
    /* no transfers loaded — that's fine */
  }

  return (
    <>
      <div className="px-8 pt-6 pb-3 border-b border-line">
        <div className="font-ui text-[11px] text-ink3 tracking-[0.08em] uppercase mb-1.5">
          Categorization rules
        </div>
        <div className="font-display text-[28px] text-ink font-medium tracking-tight">
          Imports → Aplos rules
        </div>
        <div className="font-ui text-[11.5px] text-ink3 mt-1.5 max-w-2xl">
          Each imported line is matched against rules to decide where it posts in Aplos. Rules update
          live — change one and reload the imports page to re-classify all existing cards.
        </div>
      </div>

      <RulesTabs
        squareRules={squareRules}
        subsplashGiftRules={subsplashGiftRules}
        subsplashPaymentRules={subsplashPaymentRules}
        accounts={accounts.map((a) => ({ number: a.accountNumber, name: a.name, category: a.category }))}
        funds={funds.map((f) => ({ id: f.id, name: f.name }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
        purposes={purposes.map((p) => ({ id: p.id, name: p.name, incomeAccount: p.incomeAccount, fundId: p.fundId }))}
        observedGiftFunds={observedGiftFunds}
        observedPaymentSources={observedPaymentSources}
      />
    </>
  );
}
