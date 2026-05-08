import { getAccessToken, aplos } from './auth.js';

const token = await getAccessToken();
const { body } = await aplos(token, '/tags?page_size=200');

for (const cat of body?.data?.tagcategories ?? []) {
  console.log(`\n[${cat.name}]  (category id=${cat.id})`);
  for (const group of cat.tag_groups ?? []) {
    for (const tag of group.tags ?? []) {
      console.log(`  id=${String(tag.id).padEnd(8)} ${tag.name}`);
      for (const sub of tag.sub_tags ?? []) {
        console.log(`     └ id=${String(sub.id).padEnd(8)} ${sub.name}`);
      }
    }
  }
}
