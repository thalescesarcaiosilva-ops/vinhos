import { readFileSync } from "node:fs";
import { getSupabaseConfig } from "./lib/env.mjs";
import { loadWcProducts } from "./lib/wc-csv-parser.mjs";

const CSV_PATH = "c:/Users/rodri/Downloads/produtos_corrigidos.csv";
const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };

const csvSkus = new Set(loadWcProducts(CSV_PATH).map((p) => p.sku).filter(Boolean));

const active = [];
let from = 0;
while (true) {
  const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/products?select=sku,name,is_active&is_active=eq.true&offset=${from}&limit=1000`, { headers });
  const batch = await r.json();
  if (!batch.length) break;
  active.push(...batch);
  if (batch.length < 1000) break;
  from += 1000;
}

const notInCsv = active.filter((p) => !csvSkus.has(p.sku));
const missingFromDb = [...csvSkus].filter((sku) => !active.some((p) => p.sku === sku));

console.log(`CSV SKUs: ${csvSkus.size}`);
console.log(`Ativos no banco: ${active.length}`);
console.log(`Ativos fora do CSV: ${notInCsv.length}`);
if (notInCsv.length) console.log(notInCsv.slice(0, 10));
console.log(`SKUs do CSV inativos/ausentes: ${missingFromDb.length}`);
if (missingFromDb.length) console.log(missingFromDb);
