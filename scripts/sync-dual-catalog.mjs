/**
 * Mantém ativos apenas produtos dos 2 catálogos:
 * - backup VIN (produtos-ativos-backup-2026-07-11-22-48-26.csv)
 * - CSV corrigido WooCommerce (produtos_corrigidos.csv)
 *
 * Uso: node scripts/sync-dual-catalog.mjs [--dry-run]
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
      source: "vin-backup",
    });
  }
  return products;
}

function groupDupes(items, keyFn) {
  const map = new Map();
  for (const p of items) {
    const k = keyFn(p);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()].filter(([, v]) => v.length > 1);
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
      `/rest/v1/products?select=id,sku,name,slug,gtin,is_active,price&offset=${from}&limit=1000`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const vinProducts = loadVinBackup(VIN_BACKUP);
const wcProducts = loadWcProducts(WC_CSV).map((p) => ({
  sku: p.sku,
  name: p.name,
  slug: p.slug,
  gtin: p.gtin || null,
  price: p.price,
  source: "wc-corrigido",
}));

const vinSkus = new Set(vinProducts.map((p) => p.sku));
const wcSkus = new Set(wcProducts.map((p) => p.sku));
const allowedSkus = new Set([...vinSkus, ...wcSkus]);

// Duplicatas entre os 2 CSVs
const vinByName = new Map();
const wcByName = new Map();
for (const p of vinProducts) {
  const k = normName(p.name);
  if (!vinByName.has(k)) vinByName.set(k, []);
  vinByName.get(k).push(p);
}
for (const p of wcProducts) {
  const k = normName(p.name);
  if (!wcByName.has(k)) wcByName.set(k, []);
  wcByName.get(k).push(p);
}

const crossNameDupes = [];
for (const [name, vinList] of vinByName) {
  const wcList = wcByName.get(name);
  if (!wcList) continue;
  crossNameDupes.push({
    nameKey: name,
    displayName: vinList[0].name,
    vin: vinList.map((p) => ({ sku: p.sku, slug: p.slug, price: p.price, gtin: p.gtin })),
    wc: wcList.map((p) => ({ sku: p.sku, slug: p.slug, price: p.price, gtin: p.gtin })),
  });
}

const crossGtinDupes = [];
const vinByGtin = new Map();
const wcByGtin = new Map();
for (const p of vinProducts) {
  if (!p.gtin) continue;
  if (!vinByGtin.has(p.gtin)) vinByGtin.set(p.gtin, []);
  vinByGtin.get(p.gtin).push(p);
}
for (const p of wcProducts) {
  if (!p.gtin) continue;
  if (!wcByGtin.has(p.gtin)) wcByGtin.set(p.gtin, []);
  wcByGtin.get(p.gtin).push(p);
}
for (const [gtin, vinList] of vinByGtin) {
  const wcList = wcByGtin.get(gtin);
  if (!wcList) continue;
  crossGtinDupes.push({
    gtin,
    vin: vinList.map((p) => ({ sku: p.sku, name: p.name, price: p.price })),
    wc: wcList.map((p) => ({ sku: p.sku, name: p.name, price: p.price })),
  });
}

const vinInternalNameDupes = groupDupes(vinProducts, (p) => normName(p.name));
const wcInternalNameDupes = groupDupes(wcProducts, (p) => normName(p.name));

const { url, jwt } = getSupabaseConfig();
const dbProducts = await fetchAllDb(url, jwt);

const dbSkus = new Set(dbProducts.map((p) => p.sku).filter(Boolean));
const inDbNotInCsvs = dbProducts.filter((p) => p.sku && !allowedSkus.has(p.sku));
const inCsvNotInDb = {
  vin: [...vinSkus].filter((s) => !dbSkus.has(s)),
  wc: [...wcSkus].filter((s) => !dbSkus.has(s)),
};
const activeOutside = dbProducts.filter((p) => p.is_active && p.sku && !allowedSkus.has(p.sku));
const inactiveInside = dbProducts.filter((p) => p.sku && allowedSkus.has(p.sku) && !p.is_active);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  sources: {
    vinBackup: { file: VIN_BACKUP, products: vinProducts.length, uniqueSkus: vinSkus.size },
    wcCorrigido: { file: WC_CSV, products: wcProducts.length, uniqueSkus: wcSkus.size },
    unionUniqueSkus: allowedSkus.size,
    overlapSkus: [...vinSkus].filter((s) => wcSkus.has(s)).length,
  },
  database: {
    total: dbProducts.length,
    active: dbProducts.filter((p) => p.is_active).length,
    inactive: dbProducts.filter((p) => !p.is_active).length,
    outsideCsvs: inDbNotInCsvs.length,
    outsideCsvsSamples: inDbNotInCsvs.slice(0, 20).map((p) => ({
      sku: p.sku, name: p.name, is_active: p.is_active,
    })),
    missingFromDb: inCsvNotInDb,
  },
  duplicates: {
    crossCsvByName: {
      count: crossNameDupes.length,
      productsInvolved: crossNameDupes.reduce((n, g) => n + g.vin.length + g.wc.length, 0),
      groups: crossNameDupes,
    },
    crossCsvByGtin: {
      count: crossGtinDupes.length,
      groups: crossGtinDupes,
    },
    vinInternalByName: {
      count: vinInternalNameDupes.length,
      groups: vinInternalNameDupes.map(([name, rows]) => ({
        name,
        products: rows.map((p) => ({ sku: p.sku, price: p.price })),
      })),
    },
    wcInternalByName: {
      count: wcInternalNameDupes.length,
      groups: wcInternalNameDupes.map(([name, rows]) => ({
        name,
        products: rows.map((p) => ({ sku: p.sku, price: p.price })),
      })),
    },
  },
  sync: {
    toActivate: inactiveInside.length,
    toDeactivate: activeOutside.length + dbProducts.filter((p) => !p.sku && p.is_active).length,
  },
};

console.log("=== CATÁLOGO DUAL ===");
console.log(`VIN backup: ${vinProducts.length} SKUs`);
console.log(`WC corrigido: ${wcProducts.length} SKUs`);
console.log(`União (únicos): ${allowedSkus.size} SKUs`);
console.log(`\nDuplicatas ENTRE os 2 CSVs:`);
console.log(`  Por nome idêntico: ${crossNameDupes.length} grupos`);
console.log(`  Por GTIN igual: ${crossGtinDupes.length} grupos`);
console.log(`\nDuplicatas INTERNAS:`);
console.log(`  VIN backup (mesmo nome): ${vinInternalNameDupes.length}`);
console.log(`  WC corrigido (mesmo nome): ${wcInternalNameDupes.length}`);
console.log(`\nBanco Supabase:`);
console.log(`  Total: ${dbProducts.length}`);
console.log(`  Fora dos 2 CSVs: ${inDbNotInCsvs.length}`);
console.log(`  Ativos fora dos CSVs: ${activeOutside.length}`);
console.log(`  Inativos que deveriam estar ativos: ${inactiveInside.length}`);

if (!DRY_RUN) {
  let activated = 0;
  let deactivated = 0;

  for (const p of inactiveInside) {
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
      headers: { Prefer: "return=minimal" },
    });
    activated++;
  }

  for (const p of dbProducts) {
    if (!p.is_active) continue;
    const keep = p.sku && allowedSkus.has(p.sku);
    if (keep) continue;
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
      headers: { Prefer: "return=minimal" },
    });
    deactivated++;
  }

  const after = await fetchAllDb(url, jwt);
  report.sync.result = {
    activated,
    deactivated,
    activeAfter: after.filter((p) => p.is_active).length,
    inactiveAfter: after.filter((p) => !p.is_active).length,
  };
  console.log(`\nSync: +${activated} ativados, -${deactivated} desativados`);
  console.log(`Ativos após sync: ${report.sync.result.activeAfter}`);
}

const outDir = path.join("scripts", "data", "backups");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const outPath = path.join(outDir, `dual-catalog-duplicates-${ts}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nRelatório: ${outPath}`);
