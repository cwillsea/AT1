import { getAccessToken, aplos } from './auth.js';

const token = await getAccessToken();

const all = [];
let next = '/accounts?page_size=200&page_num=1';
while (next) {
  const body = await aplos(token, next);
  all.push(...(body?.data?.accounts ?? []));
  next = body?.links?.next?.replace(/^\/api\/v1/, '') ?? null;
}

console.log(`Found ${all.length} accounts:\n`);
for (const a of all) {
  const num = String(a.account_number).padEnd(6);
  const cat = (a.category ?? '').padEnd(10);
  const status = a.is_enabled ? '  ' : '✕ ';
  console.log(`${status}${num} ${cat} ${a.name}`);
}
