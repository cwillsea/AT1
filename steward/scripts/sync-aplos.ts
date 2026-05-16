import { syncAplosCache } from "../src/lib/aplos-sync";

async function main() {
  console.log("Fetching from Aplos...");
  const counts = await syncAplosCache();
  console.log(`Synced: ${counts.accounts} accounts, ${counts.funds} funds, ${counts.tags} tags, ${counts.purposes} purposes.`);
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
