/**
 * Audita duplicatas, ativa todos os produtos e salva relatório.
 * Uso: node scripts/activate-all-and-report.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

async function rest(pathAndQuery, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${pathAndQuery}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAll() {
  const all = [];
  let from = 0;
  while (true) {
    const batch = await rest(
      `/rest/v1/products?select=id,name,slug,sku,gtin,is_active,price,created_at&offset=${from}&limit=1000`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

function groupBy(keyFn, items) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.entries()].filter(([, v]) => v.length > 1);
}

const products = await fetchAll();
const beforeActive = products.filter((p) => p.is_active).length;
const beforeInactive = products.length - beforeActive;

const dupBySku = groupBy((p) => p.sku?.trim().toLowerCase(), products);
const dupBySlug = groupBy((p) => p.slug?.trim().toLowerCase(), products);
const dupByName = groupBy((p) => p.name?.trim().toLowerCase(), products);
const dupByGtin = groupBy((p) => p.gtin?.trim(), products.filter((p) => p.gtin?.trim()));

const report = {
  generatedAt: new Date().toISOString(),
  totalProducts: products.length,
  before: { active: beforeActive, inactive: beforeInactive },
  duplicates: {
    bySku: dupBySku.map(([sku, rows]) => ({
      sku,
      count: rows.length,
      products: rows.map((p) => ({ id: p.id, name: p.name, slug: p.slug, is_active: p.is_active, price: p.price })),
    })),
    bySlug: dupBySlug.map(([slug, rows]) => ({
      slug,
      count: rows.length,
      products: rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, is_active: p.is_active })),
    })),
    byName: dupByName.map(([name, rows]) => ({
      name,
      count: rows.length,
      products: rows.map((p) => ({ id: p.id, sku: p.sku, slug: p.slug, is_active: p.is_active, price: p.price })),
    })),
    byGtin: dupByGtin.map(([gtin, rows]) => ({
      gtin,
      count: rows.length,
      products: rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, is_active: p.is_active })),
    })),
  },
  summary: {
    duplicateSkuGroups: dupBySku.length,
    duplicateSlugGroups: dupBySlug.length,
    duplicateNameGroups: dupByName.length,
    duplicateGtinGroups: dupByGtin.length,
    duplicateNameProducts: dupByName.reduce((n, [, rows]) => n + rows.length, 0),
  },
};

console.log("=== DUPLICATAS ===");
console.log(`SKU: ${dupBySku.length} grupos`);
console.log(`Slug: ${dupBySlug.length} grupos`);
console.log(`Nome: ${dupByName.length} grupos (${report.summary.duplicateNameProducts} produtos envolvidos)`);
console.log(`GTIN: ${dupByGtin.length} grupos`);

// Ativar todos
await rest(`/rest/v1/products?is_active=eq.false`, {
  method: "PATCH",
  body: JSON.stringify({ is_active: true }),
  headers: { Prefer: "return=minimal" },
});

const after = await fetchAll();
report.after = {
  active: after.filter((p) => p.is_active).length,
  inactive: after.filter((p) => !p.is_active).length,
};

const outDir = path.join("scripts", "data", "backups");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outPath = path.join(outDir, `activate-all-duplicates-report-${ts}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n=== ATIVAÇÃO ===`);
console.log(`Antes: ${beforeActive} ativos, ${beforeInactive} inativos`);
console.log(`Depois: ${report.after.active} ativos, ${report.after.inactive} inativos`);
console.log(`Relatório: ${outPath}`);
