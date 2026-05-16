import { getAccessToken, aplos } from "../src/lib/aplos-auth";

const CANDIDATES = [
  "/purposes",
  "/contribution-purposes",
  "/contributions/purposes",
  "/giving-purposes",
  "/contacts?page_size=3",
];

async function main() {
  const token = await getAccessToken();
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
            console.log(`    first ${k}[0]:`, JSON.stringify(data[k][0], null, 2).slice(0, 400));
            console.log(`    total ${k}: ${data[k].length}`);
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
