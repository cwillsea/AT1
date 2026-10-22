// One-off rules update (Aug 2026): four requested mappings.
//
//   "youth camp"      → Youth Camp ministry tag  (NOT the generic Youth tag)
//   "social sunday"   → Social Sunday ministry tag
//   "background check"→ 5331 Ad-Hoc Professional Services
//   "fellowship meal" → 5345 Meals & Entertainment  (already seeded — verified, not re-added)
//
// Priority note: classifyMinistry() walks rules in priority DESC order and
// matches by substring, so "youth camp" text would hit the existing generic
// "youth" rule (priority 13) first. The new rule therefore needs a priority
// above every existing ministry rule — hence 29, over the current max of 27.
//
// Idempotent: skips any rule whose (source, pattern) already exists.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const FUND_GENERAL = 521243;

const TAG_YOUTH_CAMP = 347374;
const TAG_SOCIAL_SUNDAY = 357278;

const ACCT_ADHOC_PROFESSIONAL = 5331; // Ad-Hoc Professional Services

const NEW_EXPENSE = [
  { priority: 108, pattern: "background check", accountNumber: ACCT_ADHOC_PROFESSIONAL, label: "Background Check → 5331" },
];

const NEW_MINISTRY = [
  // Must outrank "youth" (13) — see priority note above.
  { priority: 29, pattern: "youth camp",    fundId: FUND_GENERAL, tagId: TAG_YOUTH_CAMP,    label: "Youth Camp" },
  { priority: 28, pattern: "social sunday", fundId: FUND_GENERAL, tagId: TAG_SOCIAL_SUNDAY, label: "Social Sunday" },
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

  for (const r of NEW_MINISTRY) {
    const existing = await prisma.categorizationRule.findFirst({
      where: { source: "credit-card-ministry", pattern: r.pattern },
    });
    if (existing) {
      console.log(`  skip ministry "${r.pattern}" — already exists (id ${existing.id})`);
      continue;
    }
    const rule = await prisma.categorizationRule.create({
      data: {
        source: "credit-card-ministry",
        matchType: "contains",
        pattern: r.pattern,
        priority: r.priority,
        fundId: r.fundId,
        tagId: r.tagId,
        label: r.label,
      },
    });
    console.log(`  +  ministry id ${rule.id} "${r.pattern}" → fund ${r.fundId}, tag ${r.tagId}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
