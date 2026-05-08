import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { SquareClient, SquareEnvironment } from 'square';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '.env') });

const {
  SQUARE_ACCESS_TOKEN,
  SQUARE_ENVIRONMENT = 'production',
  BEGIN_DATE,
  END_DATE,
  LOCATION_ID,
  TIMEZONE = 'America/Phoenix',
} = process.env;

if (!SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN missing in .env');
if (!BEGIN_DATE || !END_DATE) throw new Error('BEGIN_DATE and END_DATE required in .env (YYYY-MM-DD)');

const environment =
  SQUARE_ENVIRONMENT.toLowerCase() === 'sandbox'
    ? SquareEnvironment.Sandbox
    : SquareEnvironment.Production;

const client = new SquareClient({ token: SQUARE_ACCESS_TOKEN, environment });

const shiftDays = (yyyymmdd, days) => {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const beginTime = `${shiftDays(BEGIN_DATE, -2)}T00:00:00Z`;
const endTime = `${shiftDays(END_DATE, 5)}T23:59:59Z`;

const cents = (m) => Number(m?.amount ?? 0);
const fmt = (n) => (n / 100).toFixed(2);

const sumProcessingFees = (fees) =>
  (fees ?? []).reduce((s, f) => s + cents(f.amountMoney), 0);

const escape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADERS = [
  'deposit_date',
  'payout_amount',
  'Gross Sales',
  'Net Sales',
  'Tip',
  'Total Collected',
  'Fees',
  'Net Total',
  'Description',
];

async function collect(pageable) {
  const out = [];
  for await (const item of pageable) out.push(item);
  return out;
}

const paymentCache = new Map();
const orderCache = new Map();

async function getPayment(id) {
  if (!paymentCache.has(id)) {
    const r = await client.payments.get({ paymentId: id });
    paymentCache.set(id, r.payment);
  }
  return paymentCache.get(id);
}

async function getOrder(id) {
  if (!orderCache.has(id)) {
    const r = await client.orders.get({ orderId: id });
    orderCache.set(id, r.order);
  }
  return orderCache.get(id);
}

const describeOrder = (order) => {
  if (!order?.lineItems?.length) return '';
  return order.lineItems
    .map((li) => {
      const q = parseInt(li.quantity ?? '1', 10);
      const name = li.variationName ? `${li.name} (${li.variationName})` : li.name;
      return q > 1 ? `${q} x ${name}` : name;
    })
    .join(', ');
};

console.log(
  `Fetching deposits ${BEGIN_DATE} → ${END_DATE} (${TIMEZONE}, ${SQUARE_ENVIRONMENT})...`,
);

const payouts = await collect(
  await client.payouts.list({
    beginTime,
    endTime,
    locationId: LOCATION_ID || undefined,
    limit: 100,
  }),
);

const inRange = payouts.filter((p) => {
  if (!p.arrivalDate) return false;
  const depositDate = shiftDays(p.arrivalDate, -1);
  return depositDate >= BEGIN_DATE && depositDate <= END_DATE;
});

console.log(
  `Found ${inRange.length} matching deposit(s). Fetching entries, payments & orders...`,
);

const rows = [];
for (const p of inRange) {
  const depositDate = shiftDays(p.arrivalDate, -1);
  const payoutAmount = fmt(cents(p.amountMoney));
  const entries = await collect(
    await client.payouts.listEntries({ payoutId: p.id, limit: 100 }),
  );
  for (const e of entries) {
    const paymentId =
      e.typeChargeDetails?.paymentId || e.typeRefundDetails?.paymentId;

    let grossCents = 0;
    let netSalesCents = 0;
    let tipCents = 0;
    let totalCents = 0;
    let feeCents = cents(e.feeAmountMoney);
    let netTotalCents = cents(e.netAmountMoney);
    let description = e.type ?? '';

    if (paymentId) {
      try {
        const payment = await getPayment(paymentId);
        if (payment) {
          grossCents = cents(payment.amountMoney);
          netSalesCents = grossCents;
          tipCents = cents(payment.tipMoney);
          totalCents = cents(payment.totalMoney);
          feeCents = sumProcessingFees(payment.processingFee);
          netTotalCents = totalCents - feeCents;

          if (payment.orderId) {
            const order = await getOrder(payment.orderId);
            description = describeOrder(order) || description;
            const discount = cents(order?.totalDiscountMoney);
            if (discount) {
              grossCents = netSalesCents + discount;
            }
          }
        }
      } catch (err) {
        console.warn(`Skipping payment ${paymentId}: ${err?.message ?? err}`);
      }
    } else {
      grossCents = cents(e.grossAmountMoney);
      netSalesCents = grossCents;
      totalCents = grossCents;
    }

    rows.push([
      depositDate,
      payoutAmount,
      fmt(grossCents),
      fmt(netSalesCents),
      fmt(tipCents),
      fmt(totalCents),
      fmt(feeCents),
      fmt(netTotalCents),
      description,
    ]);
  }
}

rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const outDir = resolve(scriptDir, 'deposits');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${BEGIN_DATE}_to_${END_DATE}.csv`);

const csv = [HEADERS, ...rows].map((r) => r.map(escape).join(',')).join('\n') + '\n';
writeFileSync(outFile, csv);

console.log(
  `Wrote ${rows.length} entries across ${inRange.length} deposits to ${outFile}`,
);
