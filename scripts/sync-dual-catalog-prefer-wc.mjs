/**
 * Mantém ambos catálogos ativos; em duplicatas entre VIN e WC,
 * mantém o produto do CSV corrigido e desativa o VIN.
 *
 * Uso: node scripts/sync-dual-catalog-prefer-wc.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";
import { parseCSV, loadWcProducts } from "./lib/wc-csv-parser.mjs";

const VIN_BACKUP = "scripts/data/backups/produtos-ativos-backup-2026-07-11-22-48-26.csv";
const WC_CSV = process.env.WC_CSV || "c:/Users/rodri/Downloads/produtos_corrigidos.csv";
const DRY_RUN = process.argv.includes("--dry-run");

function normName(s) {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function loadVinBackup(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCSV(text);
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const products = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const sku = row[idx.sku]?.trim();
    const name = row[idx.name]?.trim();
    if (!sku || !name) continue;
    products.push({
      sku,
      name,
      slug: row[idx.slug]?.trim() || null,
      gtin: row[idx.gtin]?.trim() || null,
      price: row[idx.price] ? Number(row[idx.price]) : null,
    });
  }
  return products;
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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAllDb(url, jwt) {
  const all = [];
  let from = 0;
  while (true) {
    const batch = await rest(
      url,
      jwt,
      `/rest/v1/products?select=id,sku,name,is_active,price&offset=${from}&limit=1000`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const vinProducts = loadVinBackup(VIN_BACKUP);
const wcProducts = loadWcProducts(WC_CSV);

const vinSkus = new Set(vinProducts.map((p) => p.sku));
const wcSkus = new Set(wcProducts.map((p) => p.sku));

const wcByName = new Map();
for (const p of wcProducts) {
  const k = normName(p.name);
  if (!wcByName.has(k)) wcByName.set(k, []);
  wcByName.get(k).push(p);
}

const vinToDeactivate = new Set();
const duplicateGroups = [];

for (const vp of vinProducts) {
  const k = normName(vp.name);
  const wcMatches = wcByName.get(k);
  if (!wcMatches?.length) continue;
  vinToDeactivate.add(vp.sku);
  duplicateGroups.push({
    name: vp.name,
    vin: { sku: vp.sku, price: vp.price },
    wcKept: wcMatches.map((p) => ({ sku: p.sku, price: p.price })),
  });
}

const vinSkusActive = [...vinSkus].filter((s) => !vinToDeactivate.has(s));
const allowedActiveSkus = new Set([...wcSkus, ...vinSkusActive]);

const { url, jwt } = getSupabaseConfig();
const dbProducts = await fetchAllDb(url, jwt);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  policy: "Ambos CSVs ativos; duplicata por nome → mantém WC corrigido, desativa VIN",
  counts: {
    vinTotal: vinSkus.size,
    wcTotal: wcSkus.size,
    vinDeactivatedAsDuplicate: vinToDeactivate.size,
    vinActive: vinSkusActive.length,
    wcActive: wcSkus.size,
    expectedActive: allowedActiveSkus.size,
  },
  duplicateGroups,
  sync: { activated: 0, deactivated: 0 },
};

console.log("=== POLÍTICA: WC corrigido vence em duplicatas ===");
console.log(`VIN total: ${vinSkus.size} | WC total: ${wcSkus.size}`);
console.log(`VIN desativados (duplicata): ${vinToDeactivate.size}`);
console.log(`Ativos esperados: ${allowedActiveSkus.size}`);
console.log("\nDuplicatas (VIN → WC mantido):");
for (const g of duplicateGroups) {
  console.log(`  ${g.name}`);
  console.log(`    OFF VIN ${g.vin.sku} (R$${g.vin.price})`);
  console.log(`    ON  WC  ${g.wcKept.map((w) => w.sku).join(", ")}`);
}

if (!DRY_RUN) {
  for (const p of dbProducts) {
    if (!p.sku) continue;
    const shouldBeActive = allowedActiveSkus.has(p.sku);
    if (p.is_active === shouldBeActive) continue;
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: shouldBeActive }),
      headers: { Prefer: "return=minimal" },
    });
    if (shouldBeActive) report.sync.activated++;
    else report.sync.deactivated++;
  }

  const after = await fetchAllDb(url, jwt);
  report.after = {
    active: after.filter((p) => p.is_active).length,
    inactive: after.filter((p) => !p.is_active).length,
    activeOutsidePolicy: after.filter((p) => p.is_active && p.sku && !allowedActiveSkus.has(p.sku)).length,
    inactiveInsidePolicy: after.filter((p) => !p.is_active && p.sku && allowedActiveSkus.has(p.sku)).length,
  };
  console.log(`\nSync: +${report.sync.activated} ativados, -${report.sync.deactivated} desativados`);
  console.log(`Ativos: ${report.after.active} | Inativos: ${report.after.inactive}`);
}

const outDir = path.join("scripts", "data", "backups");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outPath = path.join(outDir, `dual-catalog-prefer-wc-${ts}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Relatório: ${outPath}`);
