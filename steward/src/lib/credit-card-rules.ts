// Loads the three credit-card rule lists out of CategorizationRule and shapes
// them for credit-card-mappings.ts. Shared by every /api/credit-card route so
// all three steps of the flow classify identically.

import { prisma } from "./db";
import type { CreditCardRules } from "./credit-card-mappings";

export async function loadCreditCardRules(): Promise<CreditCardRules> {
  const [expense, ministry, merchant] = await Promise.all([
    prisma.categorizationRule.findMany({
      where: { source: "credit-card-expense" },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
    prisma.categorizationRule.findMany({
      where: { source: "credit-card-ministry" },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
    prisma.categorizationRule.findMany({
      where: { source: "credit-card-merchant" },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    }),
  ]);
  return {
    expense: expense
      .filter((r) => r.accountNumber != null)
      .map((r) => ({ pattern: r.pattern, accountNumber: r.accountNumber! })),
    ministry: ministry
      .filter((r) => r.fundId != null && r.tagId != null)
      .map((r) => ({ pattern: r.pattern, fundId: r.fundId!, tagId: r.tagId! })),
    merchant: merchant
      .filter((r) => r.label != null)
      .map((r) => ({ pattern: r.pattern, label: r.label! })),
  };
}
