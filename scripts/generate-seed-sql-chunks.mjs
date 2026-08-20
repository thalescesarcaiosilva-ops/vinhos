/**
 * Gera SQL chunks a partir do pacote seed (não toca projetos remotos).
 * node scripts/generate-seed-sql-chunks.mjs
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const dir = path.join(ROOT, "exports", "galvao-supabase-seed");
const out = path.join(dir, "sql-chunks");
mkdirSync(out, { recursive: true });

const TEXT_ARRAY_COLS = new Set(["harmonizacao", "selo"]);
const JSONB_COLS = new Set(["gallery"]);

function esc(v, col) {
  if (v === null || v === undefined) {
    if (col && TEXT_ARRAY_COLS.has(col)) return "'{}'::text[]";
    if (col && JSONB_COLS.has(col)) return "'[]'::jsonb";
    return "NULL";
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (col && TEXT_ARRAY_COLS.has(col)) {
    const arr = Array.isArray(v) ? v : [];
    const inner = arr.map((x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
    return `'${`{${inner}}`.replace(/'/g, "''")}'::text[]`;
  }
  if (typeof v === "object" || (col && JSONB_COLS.has(col))) {
    const obj = v ?? [];
    return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertRows(table, rows, cols, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const values = slice
      .map((r) => {
        const parts = cols.map((c) => {
          let v = r[c];
          if (c === "gallery" && (v === null || v === undefined)) v = [];
          return esc(v, c);
        });
        return `(${parts.join(",")})`;
      })
      .join(",\n");
    chunks.push(
      `INSERT INTO public.${table} (${cols.join(",")}) VALUES\n${values}\nON CONFLICT DO NOTHING;`,
    );
  }
  return chunks;
}

const categories = JSON.parse(readFileSync(path.join(dir, "data", "categories.json"), "utf8"));
const products = JSON.parse(readFileSync(path.join(dir, "data", "products.json"), "utf8"));
const pcs = JSON.parse(readFileSync(path.join(dir, "data", "product_categories.json"), "utf8"));
const sug = JSON.parse(readFileSync(path.join(dir, "data", "product_suggestions.json"), "utf8"));

// parents first
categories.sort((a, b) => {
  if (!a.parent_id && b.parent_id) return -1;
  if (a.parent_id && !b.parent_id) return 1;
  return String(a.id).localeCompare(String(b.id));
});

// Sem avaliações: não exportamos a tabela reviews; zera campos de rating nos produtos.
const SKIP_PRODUCT_COLS = new Set(["rating", "vivino_rating"]);
for (const p of products) {
  p.rating = null;
  p.vivino_rating = null;
}
const pcols = Object.keys(products[0]).filter((c) => !SKIP_PRODUCT_COLS.has(c));
const ccols = Object.keys(categories[0]);

writeFileSync(
  path.join(out, "00_clear.sql"),
  `-- clear catalog only (keep admin/settings from migrations)
TRUNCATE public.product_suggestions, public.product_categories, public.products, public.categories RESTART IDENTITY CASCADE;
`,
);

let n = 1;
const writeChunks = (label, chunks) => {
  for (const sql of chunks) {
    writeFileSync(path.join(out, `${String(n++).padStart(3, "0")}_${label}.sql`), sql);
  }
};

writeChunks("categories", insertRows("categories", categories, ccols, 40));
writeChunks("products", insertRows("products", products, pcols, 20));
writeChunks("product_categories", insertRows("product_categories", pcs, ["product_id", "category_id"], 100));
if (sug.length) {
  writeChunks("suggestions", insertRows("product_suggestions", sug, Object.keys(sug[0]), 50));
}

const files = readdirSync(out).filter((f) => f.endsWith(".sql")).sort();
writeFileSync(
  path.join(out, "manifest.json"),
  JSON.stringify(
    {
      files,
      counts: {
        categories: categories.length,
        products: products.length,
        product_categories: pcs.length,
        suggestions: sug.length,
      },
    },
    null,
    2,
  ),
);
console.log(`Wrote ${files.length} SQL files to ${out}`);
