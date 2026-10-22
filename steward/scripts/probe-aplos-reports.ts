import { getAccessToken, aplos } from "../src/lib/aplos-auth";

async function tryPath(token: string, p: string) {
  process.stdout.write(`\nGET ${p}\n`);
  const { status, body } = await aplos(token, p);
  process.stdout.write(`status=${status}\n`);
  const json = JSON.stringify(body, null, 2);
  process.stdout.write(json.length > 1200 ? json.slice(0, 1200) + "\n…\n" : json + "\n");
}

const guesses = [
  "/reports",
  "/report",
  "/reports/",
  "/reports?page_size=10",
  "/reports/accountactivity",
  "/reports/account_activity",
  "/reports/account-activity",
  "/reports/accountactivity?account_number=1110",
  "/reports/accountactivity?account=1110",
  "/reports/balancesheet",
  "/reports/balance_sheet",
  "/reports/balance",
  "/reports/profit-loss",
  "/reports/profitloss",
  "/reports/p&l",
  "/reports/funds",
  "/reports/registers",
  "/reports/registers/1110",
  "/reports/register/1110",
  "/reports/checkregister",
  "/reports/check-register",
  "/reports/checkregister?account_number=1110",
  "/checkregister/1110",
];

(async () => {
  const token = await getAccessToken();
  for (const g of guesses) await tryPath(token, g);
})().catch((e) => { console.error(e); process.exit(1); });
