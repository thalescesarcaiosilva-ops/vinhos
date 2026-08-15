import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };

async function searchLikeStore(query) {
  const tokens = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  let path = `/rest/v1/products?select=name,slug,is_active&is_active=eq.true&limit=200`;
  for (const token of tokens) {
    const t = token.replace(/[%_,]/g, "");
    if (!t) continue;
    path += `&or=(name.ilike.%25${encodeURIComponent(t)}%25,short_description.ilike.%25${encodeURIComponent(t)}%25,grape.ilike.%25${encodeURIComponent(t)}%25,brand.ilike.%25${encodeURIComponent(t)}%25,country.ilike.%25${encodeURIComponent(t)}%25)`;
  }
  const r = await fetch(`${url.replace(/\/$/, "")}${path}`, { headers });
  return { tokens, data: await r.json(), status: r.status };
}

const queries = [
  "Kit 6 Espumantes Costa Furra Brut Rosé",
  "Costa Furra Brut Rosé",
  "Costa Furra Brut Rose",
  "Freixenet Mia Sangria",
  "Freixenet Mia",
  "Mia Sangria",
];

for (const q of queries) {
  const { tokens, data, status } = await searchLikeStore(q);
  console.log(`\n"${q}"`);
  console.log("tokens:", tokens);
  console.log("status:", status, "results:", data?.length ?? data);
  if (Array.isArray(data) && data.length <= 5) console.log(data.map((d) => d.name));
}

// Direct ilike test for rose vs rosé
const tests = [
  `/rest/v1/products?select=name&is_active=eq.true&name=ilike.*rose*`,
  `/rest/v1/products?select=name&is_active=eq.true&name=ilike.*rosé*`,
  `/rest/v1/products?select=name&is_active=eq.true&name=ilike.*Costa Furra*`,
];
console.log("\n=== TESTES ILIKE DIRETOS ===");
for (const t of tests) {
  const r = await fetch(`${url.replace(/\/$/, "")}${t}`, { headers });
  const data = await r.json();
  console.log(t.split("name=")[1], "=>", data.length, data.slice(0,3).map((d) => d.name));
}
