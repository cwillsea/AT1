// One-off rules update (Aug 2026): daycare / child care expenses post to
// 5335 Childcare Services.
//
// Pattern note: classifyExpense() tests the regex against norm(expenseType),
// which lowercases and strips punctuation — so "Child-Care" arrives as
// "childcare" and "Day Care" as "day care". The optional-space alternation
// covers both spellings of both words.
//
// Priority note: rules are walked in priority DESC order, first match wins.
// Nothing existing would swallow "daycare"/"child care", but 109 (over the
// current max of 108) keeps it ahead of any future generic rule.
//
// Idempotent: skips the rule if (source, pattern) already exists.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const ACCT_CHILDCARE_SERVICES = 5335; // Childcare Services

const NEW_EXPENSE = [
  {
    priority: 109,
    pattern: "day ?care|child ?care",
    accountNumber: ACCT_CHILDCARE_SERVICES,
    label: "Daycare / Child Care → 5335",
  },
];

async function main() {
  for (const r of NEW_EXPENSE) {
    const existing = await prisma.categorizationRule.findFirst({
      where: { source: "credit-card-expense", pattern: r.pattern },
    });
    if (existing) {
      console.log(`  skip expense "${r.pattern}" — already exists (id ${existing.id})`);
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
    console.log(`  +  expense id ${rule.id} "${r.pattern}" → ${r.accountNumber}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
