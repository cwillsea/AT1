import { getAccessToken, aplos } from "./auth.js";

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
// Income: cash +X, income account -X.  Expense: cash -X, expense account +X.
const cashSign = tx.type === "income" ? 1 : -1;
const cashAmt = +(tx.amount * cashSign).toFixed(2);
const offsetAmt = +(-cashAmt).toFixed(2);

const tags = tx.tagIds.map((id) => ({ id }));
const body = {
  date: tx.date,
  note: tx.note,
  contact: tx.contact,
  lines: [
    {
      amount: cashAmt,
      account: { account_number: CASH_ACCOUNT },
      fund: { id: tx.fundId },
      tags,
    },
    {
      amount: offsetAmt,
      account: { account_number: tx.categoryAccount },
      fund: { id: tx.fundId },
      tags,
    },
  ],
};

console.log("Request body:\n" + JSON.stringify(body, null, 2));

if (DRY_RUN) {
  console.log("\n[DRY_RUN] Not posted. Set DRY_RUN=false to actually submit.");
  process.exit(0);
}

const token = await getAccessToken();
const { status, body: resp } = await aplos(token, "/transactions", {
  method: "POST",
  body,
});
console.log(`\nPOST /transactions → ${status}`);
console.log(JSON.stringify(resp, null, 2));
