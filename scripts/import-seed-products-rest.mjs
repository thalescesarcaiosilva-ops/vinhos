/**
 * Importa products.json no projeto SEED_* via PostgREST (precisa service_role JWT eyJ...).
 * Não usa .env do repo — só SEED_SUPABASE_URL + SEED_SUPABASE_KEY.
 *
 * node scripts/import-seed-products-rest.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const url = (process.env.SEED_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SEED_SUPABASE_KEY || "";
const PROJECT_REF = "aufvvgytbrstsrfomngm";

if (!url || !key) {
  console.error("Defina SEED_SUPABASE_URL e SEED_SUPABASE_KEY (service_role JWT do NOVO projeto).");
  process.exit(1);
}
if (!url.includes(PROJECT_REF)) {
  console.error(`Recusado: URL deve apontar para o projeto Galvao (${PROJECT_REF}).`);
  process.exit(1);
}
if (!key.startsWith("eyJ")) {
  console.error("Use a legacy service_role JWT (eyJ...), não a publishable sb_.");
  process.exit(1);
}

const SKIP = new Set(["rating", "vivino_rating"]);
const seed = path.join(ROOT, "exports", "galvao-supabase-seed", "data");
const products = JSON.parse(readFileSync(path.join(seed, "products.json"), "utf8")).map((p) => {
  const o = { ...p, rating: null, vivino_rating: null };
  for (const k of SKIP) delete o[k];
  if (!o.gallery) o.gallery = [];
  if (!o.harmonizacao) o.harmonizacao = [];
  if (!o.selo) o.selo = [];
  return o;
});
const pcs = JSON.parse(readFileSync(path.join(seed, "product_categories.json"), "utf8"));
const sug = JSON.parse(readFileSync(path.join(seed, "product_suggestions.json"), "utf8"));

async function upsert(table, rows, onConflict, chunk = 50) {
  for (let i = 0; i < rows.length; i += chunk) {
    const body = rows.slice(i, i + chunk);
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${table} @${i}: ${res.status} ${text.slice(0, 400)}`);
    }
    console.log(`${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
}

async function main() {
  console.log(`Destino ${url}`);
  console.log(`products=${products.length} (sem rating/vivino_rating)`);
  await upsert("products", products, "id", 40);
  await upsert("product_categories", pcs, "product_id,category_id", 100);
  await upsert("product_suggestions", sug, "product_id,suggested_product_id", 50);
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
