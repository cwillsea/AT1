import { getAccessToken, aplos } from './auth.js';

const token = await getAccessToken();
const { body } = await aplos(token, '/funds?page_size=200');
const funds = body?.data?.funds ?? [];

console.log(`Found ${funds.length} funds:\n`);
for (const f of funds) {
  console.log(`  id=${String(f.id).padEnd(8)} ${f.name}`);
}
