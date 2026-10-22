// One-off rules update (Aug 2026): Social Sunday posts against the Missions
// fund, not the General Fund it was seeded with in update-credit-card-rules-3.
// Idempotent: re-running just rewrites the same fundId.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "dev.db" });
const prisma = new PrismaClient({ adapter });

const FUND_MISSIONS = 523621;

async function main() {
  const result = await prisma.categorizationRule.updateMany({
    where: { source: "credit-card-ministry", pattern: "social sunday" },
    data: { fundId: FUND_MISSIONS },
  });
  console.log(`Updated ${result.count} rule(s): "social sunday" → fund ${FUND_MISSIONS} (Missions)`);

  const rows = await prisma.categorizationRule.findMany({
    where: { source: "credit-card-ministry", pattern: "social sunday" },
  });
  for (const r of rows) console.log(`  #${r.id} p=${r.priority} fund=${r.fundId} tag=${r.tagId}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
