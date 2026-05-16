import { getAccessToken, aplos } from "../src/lib/aplos-auth";

const CANDIDATES = [
  "/recurring-transactions",
  "/recurring_transactions",
  "/recurringtransactions",
  "/rt",
  "/transactions/recurring",
  "/scheduled-transactions",
  "/scheduledtransactions",
  "/recurring",
  "/transactions?recurring=true",
  "/recurring-transactions?page_size=5",
];

async function main() {
  const token = await getAccessToken();
  console.log(`Probing ${CANDIDATES.length} candidate paths...\n`);
  for (const p of CANDIDATES) {
    try {
      const { status, body } = await aplos(token, p);
      const ok = status >= 200 && status < 300;
      const shape = ok
        ? `keys=${Object.keys(body?.data ?? body ?? {}).join(",")}`
        : (body?.exception?.message ?? body?.message ?? "(no message)");
      console.log(`  ${status}  ${p.padEnd(38)}  ${shape}`);
      if (ok) {
        // Print up to 2 first records for shape understanding
        const data = body?.data ?? {};
        for (const k of Object.keys(data)) {
          if (Array.isArray(data[k]) && data[k].length > 0) {
            console.log(`    first ${k}[0]:`, JSON.stringify(data[k][0], null, 2).slice(0, 600));
            break;
          }
        }
      }
    } catch (e) {
      console.log(`  ERR  ${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
