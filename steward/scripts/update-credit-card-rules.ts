// One-off rules update: add new expense-type rules introduced by the
// May 26 credit-card import (new accounts: 5270, 5311, renamed 5810/5820).
// Idempotent: skips any rule whose (source, pattern) already exists.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

// High priority so they win against any broader pre-existing rule.
const NEW_EXPENSE = [
  { priority: 100, pattern: "cost.*merchandise",      accountNumber: 5820, label: "Cost of Merchandise Sold → 5820" },
  { priority:  99, pattern: "cost.*food.*coffee",     accountNumber: 5810, label: "Cost of Food & Coffee Supplies Sold → 5810" },
  { priority:  98, pattern: "office.*food.*kitchen",  accountNumber: 5311, label: "Office Food & Kitchen Supplies → 5311" },
  { priority:  97, pattern: "kitchen expenses",       accountNumber: 5311, label: "Kitchen Expenses → 5311" },
  { priority:  96, pattern: "meals.*entertainment",   accountNumber: 5345, label: "Meals & Entertainment → 5345" },
  { priority:  95, pattern: "general decor",          accountNumber: 5270, label: "General Decor → 5270" },
];

async function main() {
  for (const r of NEW_EXPENSE) {
    const existing = await prisma.categorizationRule.findFirst({
      where: { source: "credit-card-expense", pattern: r.pattern },
    });
    if (existing) {
      console.log(`  skip "${r.pattern}" — already exists (id ${existing.id})`);
      continue;
    }
    const rule = await prisma.categorizationRule.create({
      data: {
        source: "credit-card-expense",
        matchType: "regex",
        pattern: r.pattern,
        priority: r.priority,
        accountNumber: r.accountNumber,
        label: r.label,
      },
    });
    console.log(`  +  id ${rule.id} "${r.pattern}" → ${r.accountNumber}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
