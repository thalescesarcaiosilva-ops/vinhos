import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };

async function rest(path) {
  const r = await fetch(`${url.replace(/\/$/, "")}${path}`, { headers });
  return r.json();
}

const slugs = [
  "espumante-casa-valduga-130-brut-750ml",
  "espumante-casa-valduga-130-brut-750ml-2",
  "espumante-luiz-argenta-jovem-brut-750ml",
  "espumante-luiz-argenta-jovem-brut-750ml-2",
];
const skus = ["97021-5pjw3RJlWV32lQq", "97519-5pjw3RJlWV32lQq", "VIN802", "VIN1322"];

console.log("By slug:");
console.log(JSON.stringify(await rest(`/rest/v1/products?select=id,name,slug,sku,is_active&slug=in.(${slugs.map((s) => `"${s}"`).join(",")})`), null, 2));

console.log("\nBy sku:");
console.log(JSON.stringify(await rest(`/rest/v1/products?select=id,name,slug,sku,is_active&sku=in.(${skus.map((s) => `"${s}"`).join(",")})`), null, 2));

const active = await rest(`/rest/v1/products?select=id&is_active=eq.true`);
console.log(`\nActive products: ${active.length}`);

const dupes = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/count_duplicate_skus`, { headers }).catch(() => null);
// count active duplicate names
const all = await rest(`/rest/v1/products?select=name,sku,is_active&is_active=eq.true`);
const names = new Map();
for (const p of all) {
  const k = p.name.toLowerCase();
  names.set(k, (names.get(k) || 0) + 1);
}
const nameDupes = [...names.entries()].filter(([, c]) => c > 1);
console.log(`Duplicate active names: ${nameDupes.length}`);
if (nameDupes.length) console.log(nameDupes.slice(0, 10));
