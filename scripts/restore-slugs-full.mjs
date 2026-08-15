/**
 * Desfaz cleanup de slugs (-2): recoloca sufixo -2 nos WC que o cleanup removeu.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const REACTIVATE = ["96094-5pjw3RJlWV32lQq", "96089-5pjw3RJlWV32lQq", "97104-5pjw3RJlWV32lQq", "VIN921"];

const TEMP_BASE_SLUG = {
  "96094-5pjw3RJlWV32lQq": "kit-8-vina-de-los-andes-malbec",
  "96089-5pjw3RJlWV32lQq": "kit-8-paseo-red-blend-valle-central-d-o",
  "97104-5pjw3RJlWV32lQq": "vinho-ravanello-cabernet-sauvignon-merlot-2015-750ml",
};

async function rest(url, jwt, pathAndQuery, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${pathAndQuery}`, {
    ...opts,
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAll(url, jwt) {
  const all = [];
  let from = 0;
  while (true) {
    const batch = await rest(url, jwt, `/rest/v1/products?select=id,name,sku,slug,is_active&offset=${from}&limit=1000`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const { url, jwt } = getSupabaseConfig();
const products = await fetchAll(url, jwt);
const slugOwner = new Map(products.map((p) => [p.slug, p.id]));

let reactivated = 0;
for (const p of products) {
  if (REACTIVATE.includes(p.sku) && !p.is_active) {
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
      headers: { Prefer: "return=minimal" },
    });
    p.is_active = true;
    reactivated++;
  }
}

const wc = products.filter((p) => p.sku?.includes("-5pjw"));
const restores = [];

for (const p of wc) {
  if (/-\d+$/.test(p.slug) || p.slug.startsWith("__restore-")) continue;
  const candidate = `${p.slug}-2`;
  if (slugOwner.has(candidate) && slugOwner.get(candidate) !== p.id) continue;
  restores.push({ id: p.id, sku: p.sku, from: p.slug, to: candidate });
}

console.log(`WC a recolocar -2: ${restores.length}`);

let restored = 0;
let errors = 0;
const errorSamples = [];

for (const r of restores) {
  try {
    await rest(url, jwt, `/rest/v1/products?id=eq.${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ slug: r.to }),
      headers: { Prefer: "return=minimal" },
    });
    slugOwner.delete(r.from);
    slugOwner.set(r.to, r.id);
    const row = products.find((x) => x.id === r.id);
    if (row) row.slug = r.to;
    restored++;
    if (restored % 100 === 0) console.log(`  ${restored}/${restores.length}`);
  } catch (e) {
    errors++;
    if (errorSamples.length < 8) errorSamples.push({ sku: r.sku, msg: e.message });
  }
}

for (const p of products.filter((x) => x.slug.startsWith("__restore-"))) {
  const target = TEMP_BASE_SLUG[p.sku];
  if (!target || (slugOwner.has(target) && slugOwner.get(target) !== p.id)) continue;
  try {
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ slug: target }),
      headers: { Prefer: "return=minimal" },
    });
    slugOwner.delete(p.slug);
    slugOwner.set(target, p.id);
    p.slug = target;
    restored++;
  } catch (e) {
    errors++;
    if (errorSamples.length < 8) errorSamples.push({ sku: p.sku, step: "temp-fix", msg: e.message });
  }
}

const final = await fetchAll(url, jwt);
const withSuffix = final.filter((p) => p.sku?.includes("-5pjw") && /-\d+$/.test(p.slug)).length;

const report = {
  generatedAt: new Date().toISOString(),
  planned: restores.length,
  restored,
  reactivated,
  errors,
  errorSamples,
  wcWithNumericSuffix: withSuffix,
  active: final.filter((p) => p.is_active).length,
};

mkdirSync(path.join("scripts", "data", "backups"), { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
writeFileSync(path.join("scripts", "data", "backups", `restore-slugs-full-${ts}.json`), JSON.stringify(report, null, 2));

console.log(`\nRestaurados: ${restored}`);
console.log(`Reativados: ${reactivated}`);
console.log(`Erros: ${errors}`);
console.log(`WC com sufixo numérico: ${withSuffix}`);
console.log(`Ativos: ${report.active}`);
