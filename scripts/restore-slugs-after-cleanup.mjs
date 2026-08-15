/**
 * Desfaz cleanup de slugs: restaura slug do import WC (por nome) e VIN (por SKU no backup).
 * Reativa os 4 SKUs desativados pelo cleanup. Resolve conflitos com slugs temporários.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";
import { parseCSV } from "./lib/wc-csv-parser.mjs";

const WC_LOG = "scripts/data/backups/import-wc-log-2026-07-11-22-52-09.json";
const VIN_BACKUP = "scripts/data/backups/produtos-ativos-backup-2026-07-11-22-48-26.csv";
const REACTIVATE = ["96094-5pjw3RJlWV32lQq", "96089-5pjw3RJlWV32lQq", "97104-5pjw3RJlWV32lQq", "VIN921"];

function normName(s) {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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

const wcLog = JSON.parse(readFileSync(WC_LOG, "utf8"));
const importByName = new Map();
for (const p of wcLog.imported ?? []) {
  if (p.name && p.slug) importByName.set(normName(p.name), p.slug);
}

const vinText = readFileSync(VIN_BACKUP, "utf8").replace(/^\uFEFF/, "");
const vinRows = parseCSV(vinText);
const vinIdx = Object.fromEntries(vinRows[0].map((h, i) => [h, i]));
const vinBySku = new Map();
for (let r = 1; r < vinRows.length; r++) {
  const sku = vinRows[r][vinIdx.sku]?.trim();
  const slug = vinRows[r][vinIdx.slug]?.trim();
  if (sku && slug) vinBySku.set(sku, slug);
}

const { url, jwt } = getSupabaseConfig();
let products = await fetchAll(url, jwt);

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

function targetSlug(p) {
  if (!p.sku) return null;
  if (p.sku.includes("-5pjw")) return importByName.get(normName(p.name)) ?? null;
  if (p.sku.startsWith("VIN")) return vinBySku.get(p.sku) ?? null;
  return null;
}

const pending = products
  .map((p) => ({ ...p, target: targetSlug(p) }))
  .filter((p) => p.target && p.slug !== p.target);

console.log(`Produtos a restaurar slug: ${pending.length}`);

const slugOwner = new Map(products.map((p) => [p.slug, p.id]));
let movedToTemp = 0;
let restored = 0;
let errors = 0;
const errorSamples = [];

for (const p of pending) {
  const ownerId = slugOwner.get(p.target);
  if (ownerId && ownerId !== p.id) {
    const temp = `__restore-${p.id.slice(0, 8)}`;
    try {
      await rest(url, jwt, `/rest/v1/products?id=eq.${ownerId}`, {
        method: "PATCH",
        body: JSON.stringify({ slug: temp }),
        headers: { Prefer: "return=minimal" },
      });
      const old = products.find((x) => x.id === ownerId);
      if (old) {
        slugOwner.delete(old.slug);
        old.slug = temp;
        slugOwner.set(temp, ownerId);
      }
      movedToTemp++;
    } catch (e) {
      errors++;
      if (errorSamples.length < 8) errorSamples.push({ sku: p.sku, step: "temp", msg: e.message });
      continue;
    }
  }

  try {
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ slug: p.target }),
      headers: { Prefer: "return=minimal" },
    });
    slugOwner.delete(p.slug);
    p.slug = p.target;
    slugOwner.set(p.target, p.id);
    restored++;
    if (restored % 100 === 0) console.log(`  restaurados: ${restored}/${pending.length}`);
  } catch (e) {
    errors++;
    if (errorSamples.length < 8) errorSamples.push({ sku: p.sku, step: "restore", target: p.target, msg: e.message });
  }
}

// Segunda passada: quem ficou em slug temporário volta ao alvo correto
const afterTemp = products.filter((p) => p.slug.startsWith("__restore-"));
for (const p of afterTemp) {
  const target = targetSlug(p);
  if (!target || p.slug === target) continue;
  const ownerId = slugOwner.get(target);
  if (ownerId && ownerId !== p.id) continue;
  try {
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ slug: target }),
      headers: { Prefer: "return=minimal" },
    });
    slugOwner.delete(p.slug);
    p.slug = target;
    slugOwner.set(target, p.id);
    restored++;
  } catch (e) {
    errors++;
    if (errorSamples.length < 8) errorSamples.push({ sku: p.sku, step: "2nd", msg: e.message });
  }
}

const final = await fetchAll(url, jwt);
const wcSuffix = final.filter((p) => p.sku?.includes("-5pjw") && /-\d+$/.test(p.slug)).length;
const mism = final.filter((p) => {
  const t = targetSlug(p);
  return t && p.slug !== t;
});

const report = {
  generatedAt: new Date().toISOString(),
  pending: pending.length,
  restored,
  movedToTemp,
  reactivated,
  errors,
  errorSamples,
  wcWithNumericSuffix: wcSuffix,
  remainingMismatches: mism.length,
  mismatchSamples: mism.slice(0, 10).map((p) => ({ sku: p.sku, cur: p.slug, want: targetSlug(p) })),
};

mkdirSync(path.join("scripts", "data", "backups"), { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
writeFileSync(path.join("scripts", "data", "backups", `restore-slugs-${ts}.json`), JSON.stringify(report, null, 2));

console.log(`\nRestaurados: ${restored}`);
console.log(`Movidos p/ temp (conflito): ${movedToTemp}`);
console.log(`Reativados: ${reactivated}`);
console.log(`Erros: ${errors}`);
console.log(`WC com sufixo numérico: ${wcSuffix}`);
console.log(`Ainda divergentes: ${mism.length}`);
