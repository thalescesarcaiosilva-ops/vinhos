/**
 * Importa o pacote exports/vinelle-supabase-seed no projeto apontado pelo .env.
 *
 * ATENÇÃO: confira SUPABASE_URL — NÃO rode contra o Vinelle de produção por engano.
 *
 * Uso:
 *   node scripts/import-supabase-seed.mjs --dir exports/vinelle-supabase-seed
 *   node scripts/import-supabase-seed.mjs --dir exports/vinelle-supabase-seed --skip-images
 *   node scripts/import-supabase-seed.mjs --dir exports/vinelle-supabase-seed --force
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT, getSupabaseConfig } from "./lib/env.mjs";

const VINELLE_REF = "zsfhnjrotkbzyikkxmnm";
const CONCURRENCY = 6;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? true;
}

function walkFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkFiles(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, "/"));
  }
  return out;
}

async function upsertBatch(url, jwt, table, rows, onConflict) {
  if (!rows.length) return;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const body = rows.slice(i, i + chunk);
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: jwt,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${table} upsert: ${res.status} ${await res.text()}`);
    console.log(`  ${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
}

async function uploadObject(url, jwt, bucket, objectPath, filePath) {
  const target = `${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const buf = readFileSync(filePath);
  const res = await fetch(target, {
    method: "POST",
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text();
    return { objectPath, ok: false, status: res.status, error: text };
  }
  return { objectPath, ok: true };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const dirRel = arg("--dir", "exports/vinelle-supabase-seed");
  const skipImages = process.argv.includes("--skip-images");
  const force = process.argv.includes("--force");
  const dir = path.isAbsolute(dirRel) ? dirRel : path.join(ROOT, dirRel);

  if (!existsSync(path.join(dir, "data", "products.json"))) {
    throw new Error(`Pacote inválido: ${dir}`);
  }

  const { url, jwt } = getSupabaseConfig();
  if (url.includes(VINELLE_REF) && !force) {
    throw new Error(
      `SUPABASE_URL aponta para o Vinelle (${VINELLE_REF}). Troque o .env para o NOVO projeto, ou use --force se tiver certeza.`,
    );
  }

  console.log(`Importando de ${dir}`);
  console.log(`Destino: ${url}`);

  const categories = JSON.parse(readFileSync(path.join(dir, "data", "categories.json"), "utf8"));
  const products = JSON.parse(readFileSync(path.join(dir, "data", "products.json"), "utf8"));
  const product_categories = JSON.parse(readFileSync(path.join(dir, "data", "product_categories.json"), "utf8"));
  const product_suggestions = JSON.parse(readFileSync(path.join(dir, "data", "product_suggestions.json"), "utf8"));

  // parents first: sort categories so null parent_id come first, then by depth-ish
  categories.sort((a, b) => {
    if (!a.parent_id && b.parent_id) return -1;
    if (a.parent_id && !b.parent_id) return 1;
    return String(a.id).localeCompare(String(b.id));
  });

  console.log("1/3 Upsert categories...");
  await upsertBatch(url, jwt, "categories", categories, "id");

  console.log("2/3 Upsert products...");
  await upsertBatch(url, jwt, "products", products, "id");

  console.log("3/3 Upsert vínculos...");
  await upsertBatch(url, jwt, "product_categories", product_categories, "product_id,category_id");
  await upsertBatch(url, jwt, "product_suggestions", product_suggestions, "product_id,suggested_product_id");

  if (skipImages) {
    console.log("Imagens puladas (--skip-images).");
    return;
  }

  const imgRoot = path.join(dir, "storage", "product-images");
  const files = walkFiles(imgRoot);
  console.log(`Upload ${files.length} imagens para product-images...`);
  const results = await mapPool(files, CONCURRENCY, async (rel, idx) => {
    if (idx > 0 && idx % 50 === 0) console.log(`  imagens ${idx}/${files.length}`);
    return uploadObject(url, jwt, "product-images", rel, path.join(imgRoot, ...rel.split("/")));
  });
  const failed = results.filter((r) => !r.ok);
  console.log(`OK: ${results.length - failed.length}  falhas: ${failed.length}`);
  if (failed.length) {
    console.error(failed.slice(0, 10));
  }
  console.log("Importação concluída. Lembre: schema/migrations devem ter sido aplicadas antes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
