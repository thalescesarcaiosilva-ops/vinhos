import { getSupabaseConfig } from "./lib/env.mjs";
import { loadWcProducts } from "./lib/wc-csv-parser.mjs";

const CSV_PATH = "c:/Users/rodri/Downloads/produtos_corrigidos.csv";
const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };

async function fetchAll(select, filter = "") {
  const all = [];
  let from = 0;
  while (true) {
    const r = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/products?select=${select}${filter}&offset=${from}&limit=1000`,
      { headers },
    );
    const batch = await r.json();
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const csvProducts = loadWcProducts(CSV_PATH);
const csvSkus = new Set(csvProducts.map((p) => p.sku).filter(Boolean));
const csvNames = new Map(csvProducts.map((p) => [p.sku, p.name]));

const all = await fetchAll("id,name,slug,sku,is_active,created_at,brand,gtin");
const active = all.filter((p) => p.is_active);
const inactive = all.filter((p) => !p.is_active);

const activeInCsv = active.filter((p) => csvSkus.has(p.sku));
const activeOutsideCsv = active.filter((p) => !csvSkus.has(p.sku));
const inactiveInCsv = inactive.filter((p) => p.sku && csvSkus.has(p.sku));
const inactiveOutsideCsv = inactive.filter((p) => !p.sku || !csvSkus.has(p.sku));

const vinActive = active.filter((p) => p.sku?.startsWith("VIN"));
const vinInactive = inactive.filter((p) => p.sku?.startsWith("VIN"));
const wcSku = (p) => p.sku?.includes("-5pjw");
const wcActive = active.filter(wcSku);
const wcInactive = inactive.filter(wcSku);

// duplicate names among active
const byName = new Map();
for (const p of active) {
  const k = p.name.trim().toLowerCase();
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}
const dupActiveNames = [...byName.entries()].filter(([, v]) => v.length > 1);

// duplicate skus in DB
const bySku = new Map();
const dupSkus = [];
for (const p of all) {
  if (!p.sku) continue;
  if (bySku.has(p.sku)) dupSkus.push({ sku: p.sku, ids: [bySku.get(p.sku).id, p.id] });
  else bySku.set(p.sku, p);
}

const samples = [
  "Kit 6 Espumantes Costa Furra Brut Rosé",
  "Freixenet Mia Sangria",
  "Pack 6 Espumantes Ponto Nero Live Celebration Moscatel Rosé 750ml",
];

console.log("=== CONTAGENS GERAIS ===");
console.log(JSON.stringify({
  totalNoBanco: all.length,
  ativos: active.length,
  inativos: inactive.length,
  csvSkus: csvSkus.size,
  ativosNoCsv: activeInCsv.length,
  ativosForaDoCsv: activeOutsideCsv.length,
  inativosQueEstaoNoCsv: inactiveInCsv.length,
  inativosForaDoCsv: inactiveOutsideCsv.length,
  vinAtivos: vinActive.length,
  vinInativos: vinInactive.length,
  wcAtivos: wcActive.length,
  wcInativos: wcInactive.length,
  nomesDuplicadosAtivos: dupActiveNames.length,
  skusDuplicadosNoBanco: dupSkus.length,
}, null, 2));

console.log("\n=== ORIGEM DOS 1173 ===");
console.log(`Total atual no Supabase: ${all.length}`);
console.log(`- Catálogo VIN* (import antigo): ${all.filter((p) => p.sku?.startsWith("VIN")).length} registros`);
console.log(`- Catálogo WooCommerce (-5pjw): ${all.filter(wcSku).length} registros`);
console.log(`- Outros SKUs: ${all.filter((p) => p.sku && !p.sku.startsWith("VIN") && !wcSku(p)).length}`);
console.log(`- Sem SKU: ${all.filter((p) => !p.sku).length}`);

console.log("\n=== PRODUTOS ATIVOS FORA DO CSV (se houver) ===");
console.log(activeOutsideCsv.length ? activeOutsideCsv.map((p) => ({ name: p.name, sku: p.sku, slug: p.slug })) : "Nenhum");

console.log("\n=== SKUs DO CSV INATIVOS NO BANCO ===");
for (const p of inactiveInCsv) {
  console.log({ name: p.name, sku: p.sku, is_active: p.is_active, slug: p.slug });
}

console.log("\n=== AMOSTRAS SOLICITADAS ===");
for (const name of samples) {
  const matches = all.filter((p) => p.name.toLowerCase().includes(name.toLowerCase().slice(0, 20)));
  const exact = all.filter((p) => p.name.toLowerCase() === name.toLowerCase());
  const inCsv = csvProducts.filter((p) => p.name.toLowerCase().includes(name.toLowerCase().slice(0, 15)));
  console.log(`\n-- "${name}"`);
  console.log("No CSV:", inCsv.map((p) => ({ sku: p.sku, name: p.name })));
  console.log("No Supabase:", (exact.length ? exact : matches).map((p) => ({
    name: p.name, sku: p.sku, is_active: p.is_active, slug: p.slug, brand: p.brand,
  })));
}

// Simulate store search AND logic
function simulateSearch(query) {
  const tokens = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const fields = (p) => [
    p.name, p.short_description, p.grape, p.brand, p.country,
  ].map((f) => (f ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

  return active.filter((p) => {
    const vals = fields(p);
    return tokens.every((token) => vals.some((v) => v.includes(token)));
  });
}

console.log("\n=== SIMULAÇÃO BUSCA LOJA (lógica atual) ===");
for (const q of [
  "Kit 6 Espumantes Costa Furra Brut Rosé",
  "Costa Furra Brut Rosé",
  "Costa Furra",
  "Freixenet Mia Sangria",
]) {
  const hits = simulateSearch(q);
  console.log(`"${q}" => ${hits.length} resultado(s)`);
  if (hits.length <= 3) console.log(hits.map((p) => p.name));
}

// Check if ilike without accent normalization would fail
const costa = active.find((p) => p.name.includes("Kit 6 Espumantes Costa Furra"));
if (costa) {
  console.log("\n=== TESTE ACENTO 'Rosé' vs 'rose' ===");
  console.log("Produto ativo:", { name: costa.name, is_active: costa.is_active, sku: costa.sku });
  console.log("name includes 'rose' (sem acento):", costa.name.toLowerCase().includes("rose"));
  console.log("name includes 'rosé':", costa.name.toLowerCase().includes("rosé"));
}

console.log("\n=== INATIVOS FORA DO CSV (amostra 15) ===");
console.log(inactiveOutsideCsv.slice(0, 15).map((p) => ({ name: p.name, sku: p.sku })));

console.log("\n=== RESUMO INATIVOS FORA CSV POR PREFIXO SKU ===");
const prefixes = {};
for (const p of inactiveOutsideCsv) {
  const pre = p.sku?.startsWith("VIN") ? "VIN*" : p.sku?.includes("-5pjw") ? "WC-duplicata" : p.sku ? "outro" : "sem-sku";
  prefixes[pre] = (prefixes[pre] || 0) + 1;
}
console.log(prefixes);
console.log(`Total inativos fora do CSV: ${inactiveOutsideCsv.length}`);
