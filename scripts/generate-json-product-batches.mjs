/**
 * Gera batches SQL com jsonb_populate_recordset (sem rating/vivino_rating).
 * node scripts/generate-json-product-batches.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const seed = path.join(ROOT, "exports", "galvao-supabase-seed");
const out = path.join(seed, "json-batches");
mkdirSync(out, { recursive: true });

const COLS = [
  "id",
  "name",
  "slug",
  "short_description",
  "description",
  "country",
  "region",
  "grape",
  "wine_type",
  "classification",
  "brand",
  "vintage",
  "wine_style",
  "serving_temp",
  "glass_type",
  "decanting",
  "harmonization",
  "visual_notes",
  "nose_notes",
  "palate_notes",
  "sku",
  "price",
  "compare_at_price",
  "stock",
  "image_url",
  "gallery",
  "category_id",
  "featured",
  "best_seller",
  "is_active",
  "created_at",
  "updated_at",
  "product_type",
  "color",
  "is_zero_alcohol",
  "harmonizacao",
  "selo",
  "brand_id",
  "region_id",
  "collection_id",
  "video_url",
  "aging",
  "alcohol_content",
  "gtin",
];

function pick(row) {
  const o = {};
  for (const c of COLS) {
    let v = row[c];
    if ((c === "gallery" || c === "harmonizacao" || c === "selo") && (v == null)) v = [];
    o[c] = v ?? null;
  }
  return o;
}

function writeBatch(name, sql) {
  writeFileSync(path.join(out, name), sql, "utf8");
}

const products = JSON.parse(readFileSync(path.join(seed, "data", "products.json"), "utf8"));
const pcs = JSON.parse(readFileSync(path.join(seed, "data", "product_categories.json"), "utf8"));
const sug = JSON.parse(readFileSync(path.join(seed, "data", "product_suggestions.json"), "utf8"));

const SIZE = 5;
let n = 0;
for (let i = 0; i < products.length; i += SIZE) {
  const slice = products.slice(i, i + SIZE).map(pick);
  const tag = `p${n}`;
  const sql = `INSERT INTO public.products (${COLS.join(",")})
SELECT ${COLS.join(",")} FROM jsonb_populate_recordset(NULL::public.products, $${tag}$${JSON.stringify(slice)}$${tag}$::jsonb)
ON CONFLICT (id) DO NOTHING;`;
  writeBatch(`${String(++n).padStart(3, "0")}_products.sql`, sql);
}

const linkSize = 150;
for (let i = 0; i < pcs.length; i += linkSize) {
  const slice = pcs.slice(i, i + linkSize);
  const tag = `c${n}`;
  const sql = `INSERT INTO public.product_categories (product_id, category_id)
SELECT product_id, category_id
FROM jsonb_populate_recordset(NULL::public.product_categories, $${tag}$${JSON.stringify(slice)}$${tag}$::jsonb)
ON CONFLICT DO NOTHING;`;
  writeBatch(`${String(++n).padStart(3, "0")}_product_categories.sql`, sql);
}

if (sug.length) {
  const tag = `s${n}`;
  const sql = `INSERT INTO public.product_suggestions (product_id, suggested_product_id, sort_order)
SELECT product_id, suggested_product_id, sort_order
FROM jsonb_populate_recordset(NULL::public.product_suggestions, $${tag}$${JSON.stringify(sug)}$${tag}$::jsonb)
ON CONFLICT DO NOTHING;`;
  writeBatch(`${String(++n).padStart(3, "0")}_suggestions.sql`, sql);
}

const files = readdirSync(out).filter((f) => f.endsWith(".sql")).sort();
writeFileSync(path.join(out, "queue.json"), JSON.stringify({ files, products: products.length, pcs: pcs.length, sug: sug.length }, null, 2));
console.log(`Wrote ${files.length} batches to ${out}`);
