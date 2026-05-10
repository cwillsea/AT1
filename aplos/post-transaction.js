import { getAccessToken } from "./auth.js";
import { buildLine, postTransaction } from "./transactions.js";

// ─── EDIT THIS BLOCK ──────────────────────────────────────────
const DRY_RUN = false; // false = actually POST to Aplos
const tx = {
  type: "income", // 'income' or 'expense'
  date: "2026-05-08", // YYYY-MM-DD
  amount: 12.34, // dollars, always positive
  note: "test transaction from API",
  categoryAccount: 4110, // e.g. 5310 Office Supplies for an expense, 4110 Tithes for income
  fundId: 521243, // 521243 General | 521244 Capital | 523621 Missions | 525461 Academy
  tagIds: [339561], // run `node aplos/tags.js` to list. Required by Aplos.
  contact: { companyname: "Test Vendor", type: "company" },
};
const CASH_ACCOUNT = 1110; // Operating Checking
// ──────────────────────────────────────────────────────────────

if (tx.amount <= 0)
  throw new Error("amount must be positive; type controls direction");

// Sign convention: cash + means money in, cash - means money out.
const cashSign = tx.type === "income" ? 1 : -1;
const cashAmt = tx.amount * cashSign;

const lines = [
  buildLine({ accountNumber: CASH_ACCOUNT,        fundId: tx.fundId, tagIds: tx.tagIds, amount: cashAmt }),
  buildLine({ accountNumber: tx.categoryAccount,  fundId: tx.fundId, tagIds: tx.tagIds, amount: -cashAmt }),
];

const txBody = { date: tx.date, note: tx.note, contact: tx.contact, lines };
console.log("Request body:\n" + JSON.stringify(txBody, null, 2));

if (DRY_RUN) {
  console.log("\n[DRY_RUN] Not posted. Set DRY_RUN=false to actually submit.");
  process.exit(0);
}

const token = await getAccessToken();
const { status, body: resp } = await postTransaction(token, txBody);
console.log(`\nPOST /transactions → ${status}`);
console.log(JSON.stringify(resp, null, 2));
