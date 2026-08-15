/**
 * Desativa duplicatas e aplica 15% em produtos Combo.
 * Uso: node scripts/fix-duplicates-and-combos.mjs
 */
import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();

async function rest(path, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...opts,
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAllActive() {
  const all = [];
  let from = 0;
  while (true) {
    const data = await rest(
      `/rest/v1/products?select=id,name,price,sku,created_at,is_active&is_active=eq.true&order=created_at.desc&offset=${from}&limit=1000`,
    );
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function normName(name) {
  return name.toLowerCase().trim();
}

function normFuzzy(name) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function main() {
  const products = await fetchAllActive();
  console.log(`Produtos ativos: ${products.length}`);

  const toDeactivate = new Set();

  // Duplicatas exatas por nome
  const byName = new Map();
  for (const p of products) {
    const key = normName(p.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  }
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    group.sort((a, b) => Number(a.price) - Number(b.price) || new Date(b.created_at) - new Date(a.created_at));
    for (let i = 1; i < group.length; i++) toDeactivate.add(group[i].id);
  }

  // Kit Cordero 3 garrafas (nomes parecidos)
  const cordero = products.filter((p) => normFuzzy(p.name).includes("kit3garrafas") && normFuzzy(p.name).includes("corderoconpieldelobomalbec"));
  if (cordero.length > 1) {
    cordero.sort((a, b) => Number(a.price) - Number(b.price) || new Date(b.created_at) - new Date(a.created_at));
    for (let i = 1; i < cordero.length; i++) toDeactivate.add(cordero[i].id);
  }

  console.log(`Desativando ${toDeactivate.size} duplicatas...`);
  for (const id of toDeactivate) {
    await rest(`/rest/v1/products?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
      headers: { Prefer: "return=minimal" },
    });
  }

  // 15% em combos
  const combos = products.filter((p) => /combo/i.test(p.name) && !toDeactivate.has(p.id));
  console.log(`Aplicando 15% em ${combos.length} combos...`);
  for (const p of combos) {
    const newPrice = Math.round(Number(p.price) * 0.85 * 100) / 100;
    await rest(`/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ price: newPrice, compare_at_price: null }),
      headers: { Prefer: "return=minimal" },
    });
  }

  console.log("Concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
