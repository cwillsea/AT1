// Backfills / incrementally updates the local Aplos general-ledger copy.
// First run walks all-time history (slow — throttled detail fetches); later
// runs only pull transactions modified since the last watermark.
//
// Run: npx tsx scripts/sync-aplos-ledger.ts
import { syncAplosLedger } from "../src/lib/aplos-ledger-sync";

async function main() {
  console.log("Syncing Aplos ledger...");
  const t0 = Date.now();
  const r = await syncAplosLedger();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[${r.mode}] listed ${r.headersListed} headers, upserted ${r.detailsFetched} transactions in ${secs}s. ` +
      `Watermark (max modified): ${r.watermark ?? "(none)"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
