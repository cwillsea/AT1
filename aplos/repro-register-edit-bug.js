// ─────────────────────────────────────────────────────────────────────────────
// REPRO: register transaction posts fine via API but is NOT editable in Aplos UI
//
// THE BUG (for the Aplos support call):
//   POST /transactions accepts a balanced multi-line register transaction (cash on
//   1110 Operating Checking + an income line + a Square-fee expense line on 5361),
//   returns 200, and the transaction reports correctly. But opening that same
//   transaction in the Aplos register editor and trying to save throws:
//       "unexpected movement layout"
//   i.e. the API creates a transaction whose own register editor refuses it.
//
// HOW TO USE IT LIVE IN THE MEETING:
//   1. Leave DRY_RUN = true first — run it to print the exact JSON body you're sending:
//          node aplos/repro-register-edit-bug.js
//   2. Flip DRY_RUN = false (or pass --post) to actually create it:
//          node aplos/repro-register-edit-bug.js --post
//      It prints the new transaction id + a direct Aplos URL. Open that, hit edit,
//      and the "unexpected movement layout" error reproduces.
//   3. Try a different line layout to show support you tested multiple shapes:
//          node aplos/repro-register-edit-bug.js --shape=3line --post
//          node aplos/repro-register-edit-bug.js --shape=4line --post
//          node aplos/repro-register-edit-bug.js --shape=simple --post   (no fees; sanity control)
//
//   --get=<id>   refetch a transaction so you can show GET succeeds while edit fails:
//          node aplos/repro-register-edit-bug.js --get=123456
// ─────────────────────────────────────────────────────────────────────────────

import { getAccessToken, aplos, APLOS_BASE } from "./auth.js";
import { buildLine, postTransaction } from "./transactions.js";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
let DRY_RUN = true;        // false (or --post flag) = actually POST to Aplos
let SHAPE = "4line";       // "4line" | "3line" | "simple"  (override with --shape=)
// ──────────────────────────────────────────────────────────────────────────────

// Accounts / fund / tags — same real IDs used by post-square-deposits.js
const CASH = 1110;             // Operating Checking
const FEES = 5361;             // Square / processing fees (expense)
const COFFEE = 4510;           // Food & Coffee Sales (income)
const FUND_GENERAL = 521243;   // General
const TAG_HOLY_GROUNDS = 339545;
const TAG_GENERAL = 339561;

// A small, obviously-fake transaction so it's easy to find + delete after the demo.
const DATE = new Date().toISOString().slice(0, 10);
const GROSS = 100.0;   // income collected
const FEE = 2.5;       // Square fee
const NET = GROSS - FEE;

// ─── arg parsing ──────────────────────────────────────────────────────────────
let GET_ID = null;
for (const a of process.argv.slice(2)) {
  if (a === "--post") DRY_RUN = false;
  else if (a === "--dry") DRY_RUN = true;
  else if (a.startsWith("--shape=")) SHAPE = a.slice("--shape=".length);
  else if (a.startsWith("--get=")) GET_ID = a.slice("--get=".length);
}

// ─── line-layout shapes ─────────────────────────────────────────────────────────
function buildLines(shape) {
  switch (shape) {
    // 4-line: cash on BOTH sides (gross in, fee out) + gross income + fee expense.
    // This is the placeholder shape post-square-deposits.js currently ships.
    case "4line":
      return [
        buildLine({ accountNumber: CASH,   fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount:  GROSS }),
        buildLine({ accountNumber: CASH,   fundId: FUND_GENERAL, tagIds: [TAG_GENERAL],       amount: -FEE   }),
        buildLine({ accountNumber: FEES,   fundId: FUND_GENERAL, tagIds: [TAG_GENERAL],       amount:  FEE   }),
        buildLine({ accountNumber: COFFEE, fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount: -GROSS }),
      ];

    // 3-line: single NET cash line + gross income + fee expense.
    case "3line":
      return [
        buildLine({ accountNumber: CASH,   fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount:  NET   }),
        buildLine({ accountNumber: FEES,   fundId: FUND_GENERAL, tagIds: [TAG_GENERAL],       amount:  FEE   }),
        buildLine({ accountNumber: COFFEE, fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount: -GROSS }),
      ];

    // simple: plain 2-line income, no fee line. Control case — this one edits fine.
    case "simple":
      return [
        buildLine({ accountNumber: CASH,   fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount:  GROSS }),
        buildLine({ accountNumber: COFFEE, fundId: FUND_GENERAL, tagIds: [TAG_HOLY_GROUNDS], amount: -GROSS }),
      ];

    default:
      throw new Error(`Unknown --shape=${shape}. Use 4line | 3line | simple.`);
  }
}

// ─── --get mode: refetch a transaction ─────────────────────────────────────────
if (GET_ID) {
  const token = await getAccessToken();
  const { status, body } = await aplos(token, `/transactions/${GET_ID}`);
  console.log(`GET /transactions/${GET_ID} → ${status}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(status >= 400 ? 1 : 0);
}

// ─── build + show the request ───────────────────────────────────────────────────
const lines = buildLines(SHAPE);
const tx = {
  date: DATE,
  note: `API REPRO ${SHAPE} — register-edit bug demo (safe to delete)`,
  contact: { companyname: "Square", type: "company" },
  lines,
};

const sum = lines.reduce((s, l) => s + l.amount, 0);
console.log(`Endpoint : POST ${APLOS_BASE}/transactions`);
console.log(`Shape    : ${SHAPE}   (lines balance = ${sum.toFixed(4)})`);
console.log(`Request body:\n${JSON.stringify(tx, null, 2)}\n`);

if (DRY_RUN) {
  console.log("[DRY_RUN] Nothing posted. Re-run with --post to actually create it.");
  process.exit(0);
}

// ─── post it ────────────────────────────────────────────────────────────────────
const token = await getAccessToken();
const { status, body } = await postTransaction(token, tx);
const id = body?.data?.transaction?.id ?? body?.data?.id ?? null;

console.log(`POST /transactions → ${status}`);
console.log(JSON.stringify(body, null, 2));

if (id) {
  console.log(`\n✅ Created transaction id=${id}`);
  console.log(`   Open in Aplos and try to EDIT it to reproduce "unexpected movement layout":`);
  console.log(`   https://app.aplos.com/aplos/p/accounting/transactions/${id}`);
  console.log(`   (Refetch via API:  node aplos/repro-register-edit-bug.js --get=${id})`);
} else {
  console.log("\n⚠️  No transaction id in response — check the body above.");
}
process.exit(status >= 400 ? 1 : 0);
