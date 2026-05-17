import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const COFFEE = 4510;
const MERCH = 4520;
const FUND_GENERAL = 521243;
const TAG_HOLY_GROUNDS = 339545;
const TAG_YOUTH = 338178;

// Seed mirrors the previously hardcoded regex logic from
// aplos/post-square-deposits.js / src/lib/square-csv.ts, flattened into
// priority-ordered rules. Higher priority short-circuits.
//
// Behavior notes:
//   "Yth Shirt"   → matches "yth shirt" (priority 100) → MERCH + YOUTH
//   "Youth Snack" → matches "youth"     (priority 50)  → COFFEE + YOUTH
//   "Raffle"      → matches "raffle"    (priority 90)  → MERCH + HOLY_GROUNDS
//   "GodLoveSoul" → nothing matches → surfaced in the UI as "needs rule"
const RULES = [
  { pattern: "yth shirt",  priority: 100, accountNumber: MERCH,  tagId: TAG_YOUTH,         label: "Youth Shirt → Merch + Youth" },
  { pattern: "youth shirt",priority: 100, accountNumber: MERCH,  tagId: TAG_YOUTH,         label: "Youth Shirt → Merch + Youth" },
  { pattern: "shirt",      priority:  90, accountNumber: MERCH,  tagId: TAG_HOLY_GROUNDS,  label: "Shirt → Merch + Holy Grounds" },
  { pattern: "raffle",     priority:  90, accountNumber: MERCH,  tagId: TAG_HOLY_GROUNDS,  label: "Raffle → Merch + Holy Grounds" },
  { pattern: "youth",      priority:  50, accountNumber: COFFEE, tagId: TAG_YOUTH,         label: "Youth → Coffee + Youth" },
  { pattern: "yth",        priority:  50, accountNumber: COFFEE, tagId: TAG_YOUTH,         label: "Yth → Coffee + Youth" },
  { pattern: "holy pop",   priority:  50, accountNumber: COFFEE, tagId: TAG_YOUTH,         label: "Holy Pop → Coffee + Youth" },
];

async function main() {
  const existing = await prisma.categorizationRule.findMany({ where: { source: "square" } });
  if (existing.length > 0) {
    console.log(`${existing.length} rules already exist for square — skipping seed.`);
    console.log("To re-seed, delete existing rows first via Prisma Studio or DELETE FROM CategorizationRule WHERE source='square';");
    return;
  }
  for (const r of RULES) {
    await prisma.categorizationRule.create({
      data: { source: "square", matchType: "contains", fundId: FUND_GENERAL, ...r },
    });
  }
  console.log(`Seeded ${RULES.length} rules for square.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
