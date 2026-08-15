/**
 * Exporta todos os produtos ativos para CSV (backup antes de importação).
 * Uso: node scripts/export-active-products.mjs [caminho-saida.csv]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const COLS = [
  "id", "name", "slug", "sku", "gtin", "price", "compare_at_price", "stock",
  "short_description", "description", "country", "region", "grape", "wine_type",
  "classification", "brand", "vintage", "wine_style", "serving_temp", "glass_type",
  "decanting", "harmonization", "visual_notes", "nose_notes", "palate_notes",
  "vivino_rating", "rating", "image_url", "gallery", "video_url", "category_id",
  "featured", "best_seller", "is_active", "product_type", "color", "harmonizacao",
  "selo", "alcohol_content", "aging", "created_at", "updated_at",
];

function csvEscape(v) {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("|") : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function restGet(url, jwt, query) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/products?${query}`, {
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllActive(url, jwt) {
  const all = [];
  const page = 1000;
  let from = 0;
  const select = COLS.join(",");
  while (true) {
    const data = await restGet(url, jwt, `select=${encodeURIComponent(select)}&is_active=eq.true&order=name.asc&offset=${from}&limit=${page}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = path.join("scripts", "data", "backups");
  mkdirSync(outDir, { recursive: true });
  const outPath = process.argv[2] || path.join(outDir, `produtos-ativos-backup-${ts}.csv`);

  console.log("Exportando produtos ativos...");
  const products = await fetchAllActive(url, jwt);
  const lines = [COLS.join(",")];
  for (const p of products) {
    lines.push(COLS.map((c) => csvEscape(p[c])).join(","));
  }
  writeFileSync(outPath, "\uFEFF" + lines.join("\n"), "utf8");
  console.log(`Backup salvo: ${outPath}`);
  console.log(`Total: ${products.length} produtos ativos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
