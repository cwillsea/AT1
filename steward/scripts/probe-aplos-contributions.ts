import { getAccessToken, aplos } from "../src/lib/aplos-auth";

const CANDIDATES = [
  "/contributions",
  "/contributions?page_size=5",
  "/contribution-batches",
  "/contribution-deposits",
  "/donations",
  "/donations?page_size=5",
  "/gifts",
  "/donors",
  "/donors?page_size=5",
  "/donor-groups",
  "/giving",
  "/giving/contributions",
  "/giving/batches",
  "/giving/deposits",
  "/contributions/batches",
  "/contributions/deposits",
];

async function main() {
  const token = await getAccessToken();
  console.log(`Probing ${CANDIDATES.length} candidate contribution paths...\n`);
  for (const p of CANDIDATES) {
    try {
      const { status, body } = await aplos(token, p);
      const ok = status >= 200 && status < 300;
      const shape = ok
        ? `keys=${Object.keys(body?.data ?? body ?? {}).join(",")}`
        : (body?.exception?.message ?? body?.message ?? "(no message)");
      console.log(`  ${status}  ${p.padEnd(34)}  ${shape}`);
      if (ok) {
        const data = body?.data ?? {};
        for (const k of Object.keys(data)) {
          if (Array.isArray(data[k]) && data[k].length > 0) {
            console.log(`    first ${k}[0]:`, JSON.stringify(data[k][0], null, 2).slice(0, 700));
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
