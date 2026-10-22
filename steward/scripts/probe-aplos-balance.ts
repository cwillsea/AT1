import { getAccessToken, aplos } from "../src/lib/aplos-auth";

async function tryPath(token: string, p: string) {
  process.stdout.write(`\nGET ${p}\n`);
  const { status, body } = await aplos(token, p);
  process.stdout.write(`status=${status}\n`);
  const json = JSON.stringify(body, null, 2);
  process.stdout.write(json.length > 1500 ? json.slice(0, 1500) + "\n…\n" : json + "\n");
}

const guesses = [
  "/reports/trial-balance",
  "/reports/trial-balance?as_of=2026-06-09",
  "/reports/trialbalance",
  "/reports/general-ledger",
  "/reports/general-ledger?account_number=1110",
  "/reports/account-activity?account_number=1110",
  "/reports/cash-flow",
  "/reports/income-statement",
  "/reports/ledger?account_number=1110",
  "/ledger?account_number=1110",
  "/ledger/1110",
  "/general-ledger?account_number=1110",
  "/reconciliations",
  "/reconciliations?account_number=1110",
  "/statements?account_number=1110",
  "/statements",
  "/accounts/1110/transactions",
  "/accounts/1110/activity",
  "/accounts/1110/summary",
];

(async () => {
  const token = await getAccessToken();
  for (const g of guesses) await tryPath(token, g);
})().catch((e) => { console.error(e); process.exit(1); });
