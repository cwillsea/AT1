import { getAccessToken, aplos } from "../src/lib/aplos-auth";

async function main() {
  const token = await getAccessToken();

  // Get list, grab an id
  const list = await aplos(token, "/contributions?page_size=5");
  const contributions: { id: number; name: string; date: string }[] = list.body?.data?.contributions ?? [];
  console.log(`List endpoint returned ${contributions.length} (showing 3):`);
  for (const c of contributions.slice(0, 3)) {
    console.log(`  id=${c.id}  date=${c.date}  name=${c.name}`);
  }

  if (contributions.length === 0) {
    console.log("No contributions to inspect.");
    return;
  }

  // Get detail of one
  const id = contributions[0].id;
  console.log(`\nFetching detail for contribution ${id}...`);
  const detail = await aplos(token, `/contributions/${id}`);
  console.log("Status:", detail.status);
  console.log("Body keys:", Object.keys(detail.body?.data ?? {}));
  console.log("Full body:");
  console.log(JSON.stringify(detail.body, null, 2).slice(0, 3000));

  // Try listing related lines / splits
  for (const subpath of ["splits", "lines", "items", "donors", "transactions"]) {
    const sub = await aplos(token, `/contributions/${id}/${subpath}`);
    console.log(`\n/contributions/${id}/${subpath}  → ${sub.status}`);
    if (sub.status >= 200 && sub.status < 300) {
      console.log(JSON.stringify(sub.body, null, 2).slice(0, 700));
    }
  }

  // Probe contribution list filter params
  console.log("\nProbing /contributions filter shapes:");
  for (const q of ["?from=2026-04-01&to=2026-04-30", "?date_from=2026-04-01", "?start=2026-04-01"]) {
    const r = await aplos(token, "/contributions" + q + "&page_size=3");
    console.log(`  /contributions${q}&page_size=3 → ${r.status}  returned ${r.body?.data?.contributions?.length ?? 0}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
