// One-off probe: confirms the shape of Aplos /transactions GET and how to
// retrieve the operating-checking (account 1110) balance. Output is logged so
// we can encode the right field paths in steward/src/lib/aplos-transactions.ts
// and aplos-balance.ts.
//
// Run: npx tsx scripts/probe-aplos-reconcile.ts
import { getAccessToken, aplos } from "../src/lib/aplos-auth";

const CHECKING = 1110;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function tryPath(token: string, label: string, p: string) {
  process.stdout.write(`\n=== ${label} ===\nGET ${p}\n`);
  const { status, body } = await aplos(token, p);
  process.stdout.write(`status=${status}\n`);
  const json = JSON.stringify(body, null, 2);
  process.stdout.write(json.length > 6000 ? json.slice(0, 6000) + "\n…(truncated)\n" : json + "\n");
}

async function main() {
  const token = await getAccessToken();
  const start = isoDaysAgo(30);
  const end = isoDaysAgo(0);

  // 1) Transactions listing with date filter
  await tryPath(token, "transactions (date range)", `/transactions?start_date=${start}&end_date=${end}&page_size=5`);

  // 2) Transactions filtered by account_number (if supported)
  await tryPath(token, "transactions (date + account_number)", `/transactions?start_date=${start}&end_date=${end}&account_number=${CHECKING}&page_size=5`);

  // 3) Account detail — does it carry a balance?
  await tryPath(token, "account 1110 detail", `/accounts/${CHECKING}`);

  // 4) Balance/ledger endpoint guesses
  for (const guess of [
    `/accounts/${CHECKING}/balance`,
    `/accounts/${CHECKING}/balances`,
    `/accounts/${CHECKING}/ledger`,
    `/reports/balance-sheet?as_of=${end}`,
    `/reports/balances?as_of=${end}`,
  ]) {
    await tryPath(token, `balance probe ${guess}`, guess);
  }
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
