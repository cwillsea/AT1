// Follow-up probe: transaction detail (for line items / signed amounts) and
// more balance endpoint guesses.
import { getAccessToken, aplos } from "../src/lib/aplos-auth";

async function tryPath(token: string, label: string, p: string) {
  process.stdout.write(`\n=== ${label} ===\nGET ${p}\n`);
  const { status, body } = await aplos(token, p);
  process.stdout.write(`status=${status}\n`);
  const json = JSON.stringify(body, null, 2);
  process.stdout.write(json.length > 4000 ? json.slice(0, 4000) + "\n…(truncated)\n" : json + "\n");
}

async function main() {
  const token = await getAccessToken();
  // Use an ID from the earlier probe — Square Payout 67630886 had amount 93.53.
  const sampleIds = [67630886, 67591147, 67631963];

  // Detail endpoint per ID
  for (const id of sampleIds) {
    await tryPath(token, `txn detail ${id}`, `/transactions/${id}`);
  }

  // Include / expand param attempts on listing
  await tryPath(token, "listing with include=lines", `/transactions?start_date=2026-05-28&end_date=2026-05-28&include=lines&page_size=2`);
  await tryPath(token, "listing with expand=lines", `/transactions?start_date=2026-05-28&end_date=2026-05-28&expand=lines&page_size=2`);

  // Balance endpoint guesses
  for (const p of [
    `/registers/1110`,
    `/registers/1110/balance`,
    `/registers`,
    `/accounts/1110?include=balance`,
    `/accounts?account_number=1110&include=balance`,
    `/reports/account-balance?account_number=1110`,
    `/balances?account_number=1110`,
  ]) {
    await tryPath(token, `balance probe ${p}`, p);
  }
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
