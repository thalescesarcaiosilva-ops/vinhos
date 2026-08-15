import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

async function rest(path, opts = {}) {
  const r = await fetch(`${url.replace(/\/$/, "")}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// 1) Liberar slugs dos produtos VIN inativos
const slugFixes = [
  { id: "b833b3e6-9e06-4c8a-8174-321e52da9b8e", slug: "espumante-casa-valduga-130-brut-750ml-vin802" },
  { id: "12b2413a-b736-41a6-9a83-623ffccf086b", slug: "espumante-luiz-argenta-jovem-brut-750ml-vin1322" },
];
for (const f of slugFixes) {
  await rest(`/rest/v1/products?id=eq.${f.id}`, {
    method: "PATCH",
    body: JSON.stringify({ slug: f.slug }),
    headers: { Prefer: "return=minimal" },
  });
  console.log(`Renamed inactive ${f.id} -> ${f.slug}`);
}

// 2) Atualizar slugs canônicos nos produtos WC ativos
const canonical = [
  { id: "bb8e4166-a06e-47c0-971d-3977433ad478", slug: "espumante-casa-valduga-130-brut-750ml" },
  { id: "5968240f-a4c8-445e-9471-1480ac4dea83", slug: "espumante-luiz-argenta-jovem-brut-750ml" },
];
for (const f of canonical) {
  await rest(`/rest/v1/products?id=eq.${f.id}`, {
    method: "PATCH",
    body: JSON.stringify({ slug: f.slug }),
    headers: { Prefer: "return=minimal" },
  });
  console.log(`Canonical slug ${f.id} -> ${f.slug}`);
}

// 3) Encontrar e desativar duplicatas por nome (manter SKU do CSV / mais recente WC)
const active = await rest(`/rest/v1/products?select=id,name,sku,slug,created_at,is_active&is_active=eq.true&order=created_at.desc`);
const byName = new Map();
for (const p of active) {
  const k = p.name.trim().toLowerCase();
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

let deactivated = 0;
for (const [name, products] of byName) {
  if (products.length <= 1) continue;
  // Preferir SKU WooCommerce (contém hífen e hash) sobre VIN*
  const sorted = [...products].sort((a, b) => {
    const aWc = a.sku?.includes("-5pjw") ? 1 : 0;
    const bWc = b.sku?.includes("-5pjw") ? 1 : 0;
    if (bWc !== aWc) return bWc - aWc;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const keep = sorted[0];
  for (const p of sorted.slice(1)) {
    await rest(`/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
      headers: { Prefer: "return=minimal" },
    });
    console.log(`Desativado duplicata: ${p.name} (${p.sku}) — mantido ${keep.sku}`);
    deactivated++;
  }
}

const final = await rest(`/rest/v1/products?select=id&is_active=eq.true`);
console.log(`\nAtivos: ${final.length}, duplicatas desativadas: ${deactivated}`);
