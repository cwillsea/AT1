import { aplos } from './auth.js';

export function buildLine({ accountNumber, fundId, tagIds = [], amount }) {
  return {
    amount: +amount.toFixed(2),
    account: { account_number: accountNumber },
    fund: { id: fundId },
    tags: tagIds.map(id => ({ id })),
  };
}

export async function postTransaction(token, { date, note, memo, contact, lines }) {
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(sum) > 0.005) throw new Error(`Lines do not balance: sum=${sum.toFixed(4)}`);
  const body = { date, contact, lines };
  if (note) body.note = note;
  if (memo) body.memo = memo;
  return aplos(token, '/transactions', { method: 'POST', body });
}
