// One-off rules update: fill gaps found by comparing the seeded rules
// against the actual Truist "Expense Type" and "Ministry / Ministry Event"
// dropdown option lists (Aug 2026). Idempotent: skips any rule whose
// (source, pattern) already exists.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const FUND_GENERAL = 521243;
const FUND_CAPITAL_CAMPAIGNS_KB = 521244;

const NEW_EXPENSE = [
  { priority: 107, pattern: "landscaping",           accountNumber: 5240, label: "Landscaping → 5240" },
  { priority: 106, pattern: "ministry equipment",     accountNumber: 5530, label: "Ministry Equipment → 5530" },
  { priority: 105, pattern: "missionary.*support",    accountNumber: 5610, label: "Missionary & Org Support → 5610" },
  { priority: 104, pattern: "mission trip supplies",  accountNumber: 5620, label: "Mission Trip Supplies → 5620" },
  { priority: 103, pattern: "mission trip travel",    accountNumber: 5630, label: "Mission Trip Travel → 5630" },
  { priority: 102, pattern: "christmas",              accountNumber: 5720, label: "Christmas Expenses → 5720" },
  { priority: 101, pattern: "thanksgiving",           accountNumber: 5740, label: "Thanksgiving Expenses → 5740" },
];

const NEW_MINISTRY = [
  // Higher priority than the generic "womens" (6) so it wins first.
  { priority: 19, pattern: "womens yard sale",     fundId: FUND_GENERAL,             tagId: 341169, label: "Women's Yard Sale" },
  { priority: 20, pattern: "kidcon",                fundId: FUND_GENERAL,             tagId: 341119, label: "KidCon" },
  { priority: 21, pattern: "ballin",                fundId: FUND_GENERAL,             tagId: 339553, label: "Ballin" },
  { priority: 22, pattern: "celebrate recovery",    fundId: FUND_GENERAL,             tagId: 339554, label: "Celebrate Recovery" },
  { priority: 23, pattern: "seniors for jesus",     fundId: FUND_GENERAL,             tagId: 339555, label: "Seniors For Jesus" },
  { priority: 24, pattern: "daddy daughter dance",  fundId: FUND_GENERAL,             tagId: 341886, label: "Daddy Daughter Dance" },
  { priority: 25, pattern: "kingdom builders",      fundId: FUND_CAPITAL_CAMPAIGNS_KB, tagId: 339734, label: "Kingdom Builders" },
  { priority: 26, pattern: "field trip",            fundId: FUND_GENERAL,             tagId: 346083, label: "Field Trip(s)" },
  { priority: 27, pattern: "vbs",                   fundId: FUND_GENERAL,             tagId: 353908, label: "VBS" },
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
