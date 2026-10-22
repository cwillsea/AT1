// Probe to settle the two open items before writing the ledger sync:
//   1) Does GET /transactions (list) return `lines` inline, or headers only?
//      If inline, the all-time backfill skips per-id detail fetches entirely.
//   2) Which filter params work: documented f_rangestart/f_rangeend/f_lastupdated
//      vs the non-prefixed start_date/end_date the existing reconcile code uses?
//   3) What do the `created` / `modified` timestamps look like (sync watermark)?
//
// Run: npx tsx scripts/probe-aplos-ledger-shape.ts
import { getAccessToken, aplos } from "../src/lib/aplos-auth";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function probe(token: string, label: string, path: string) {
  const { status, body } = await aplos(token, path);
  const txns: any[] = body?.data?.transactions ?? [];
  const first = txns[0];
  process.stdout.write(`\n=== ${label} ===\nGET ${path}\nstatus=${status}  count=${txns.length}\n`);
  if (status !== 200) {
    process.stdout.write(`  body: ${JSON.stringify(body).slice(0, 400)}\n`);
    return;
  }
  if (first) {
    const keys = Object.keys(first);
    process.stdout.write(`  header keys: ${keys.join(", ")}\n`);
    process.stdout.write(`  has lines inline? ${Array.isArray(first.lines) ? `YES (${first.lines.length} lines)` : "no"}\n`);
    process.stdout.write(`  created=${first.created ?? "(none)"}  modified=${first.modified ?? "(none)"}\n`);
    if (Array.isArray(first.lines) && first.lines[0]) {
      process.stdout.write(`  line[0] keys: ${Object.keys(first.lines[0]).join(", ")}\n`);
      process.stdout.write(`  line[0]: ${JSON.stringify(first.lines[0])}\n`);
    }
  }
  process.stdout.write(`  links.next: ${body?.links?.next ?? "(none)"}\n`);
}

async function main() {
  const token = await getAccessToken();
  const start = isoDaysAgo(60);
  const end = isoDaysAgo(0);

  // Q1 + Q2a: documented f_-prefixed range params, no account filter (whole ledger)
  await probe(token, "f_rangestart/f_rangeend, no account", `/transactions?f_rangestart=${start}&f_rangeend=${end}&page_size=3`);

  // Q2b: legacy non-prefixed params (what existing code uses)
  await probe(token, "start_date/end_date (legacy)", `/transactions?start_date=${start}&end_date=${end}&page_size=3`);

  // Q3: f_lastupdated incremental filter (ISO timestamp)
  const lastUpdated = `${start}T00:00:00.000Z`;
  await probe(token, "f_lastupdated (incremental)", `/transactions?f_lastupdated=${encodeURIComponent(lastUpdated)}&page_size=3`);

  // Detail endpoint, for comparison (known to carry lines)
  const { body } = await aplos(token, `/transactions?f_rangestart=${start}&f_rangeend=${end}&page_size=1`);
  const id = body?.data?.transactions?.[0]?.id;
  if (id) {
    const { status, body: detail } = await aplos(token, `/transactions/${id}`);
    const t = detail?.data?.transaction;
    process.stdout.write(`\n=== detail /transactions/${id} ===\nstatus=${status}\n`);
    process.stdout.write(`  header keys: ${t ? Object.keys(t).join(", ") : "(none)"}\n`);
    process.stdout.write(`  lines: ${Array.isArray(t?.lines) ? t.lines.length : "(none)"}\n`);
    process.stdout.write(`  created=${t?.created ?? "(none)"}  modified=${t?.modified ?? "(none)"}\n`);
  }
}

main().catch((e) => {
  console.error("probe failed:", e);
  process.exit(1);
});
