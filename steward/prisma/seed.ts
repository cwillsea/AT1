import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

// Constants lifted from aplos/post-square-deposits.js
const COFFEE = 4510;
const MERCH = 4520;
const FUND_GENERAL = 521243;
const TAG_HOLY_GROUNDS = 339545;
const TAG_YOUTH = 338178;

const rules = [
  { source: "square", pattern: "shirt", priority: 100, accountNumber: MERCH, fundId: FUND_GENERAL, tagId: TAG_HOLY_GROUNDS, label: "T-shirts" },
  { source: "square", pattern: "raffle", priority: 100, accountNumber: MERCH, fundId: FUND_GENERAL, tagId: TAG_HOLY_GROUNDS, label: "Raffle" },
  { source: "square", pattern: "youth", priority: 90, accountNumber: COFFEE, fundId: FUND_GENERAL, tagId: TAG_YOUTH, label: "Youth coffee (youth)" },
  { source: "square", pattern: "yth", priority: 90, accountNumber: COFFEE, fundId: FUND_GENERAL, tagId: TAG_YOUTH, label: "Youth coffee (yth)" },
  { source: "square", pattern: "holy pop", priority: 90, accountNumber: COFFEE, fundId: FUND_GENERAL, tagId: TAG_YOUTH, label: "Youth coffee (holy pop)" },
];

async function main() {
  for (const r of rules) {
    await prisma.categorizationRule.create({ data: r });
  }
  console.log(`Seeded ${rules.length} CategorizationRule rows.`);
}

main().finally(() => prisma.$disconnect());
