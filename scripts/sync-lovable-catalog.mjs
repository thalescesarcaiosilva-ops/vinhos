/**

 * Sincroniza catálogo Vinelle com export Lovable:

 * - Sobe imagens de bucket-product-images-files.zip → Storage product-images

 * - Mantém ativos apenas produtos do CSV (desativa extras)

 * - Upsert produtos/categorias conforme CSV

 * - Normaliza image_url/gallery para /storage/v1/object/public/product-images/{arquivo}

 *

 * Uso:

 *   node scripts/sync-lovable-catalog.mjs

 *   node scripts/sync-lovable-catalog.mjs --dry-run

 *   node scripts/sync-lovable-catalog.mjs --skip-upload

 */

import { createClient } from "@supabase/supabase-js";

import {

  readFile,

  readFileSync,

  existsSync,

  mkdirSync,

  rmSync,

  readdirSync,

} from "node:fs";

import { execSync } from "node:child_process";

import path from "node:path";

import { fileURLToPath } from "node:url";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, "..");

const CSV_PATH = process.argv.find((a) => a.endsWith(".csv")) || "D:\\products-export-2026-06-23_13-52-21.csv";

const ZIP_PATH = process.argv.find((a) => a.endsWith(".zip")) || "D:\\bucket-product-images-files.zip";

const BUCKET = "product-images";

const EXTRACT_DIR = path.join(ROOT, ".tmp", "product-images-upload");



const dryRun = process.argv.includes("--dry-run");

const skipUpload = process.argv.includes("--skip-upload");



function loadEnvFile() {

  const envPath = path.join(ROOT, ".env");

  if (!existsSync(envPath)) return;

  let text = readFileSync(envPath, "utf8");

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (const line of text.split(/\r?\n/)) {

    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!m || line.trimStart().startsWith("#")) continue;

    let val = m[2].trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {

      val = val.slice(1, -1);

    }

    if (!process.env[m[1]]) process.env[m[1]] = val;

  }

}



function resolveJwt() {

  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;

  if (fromEnv?.startsWith("eyJ")) return fromEnv;

  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (sk?.startsWith("eyJ")) return sk;

  const raw = execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", {

    encoding: "utf8",

    cwd: ROOT,

  });

  const keys = JSON.parse(raw);

  return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key ?? null;

}



loadEnvFile();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");

const JWT = resolveJwt();

if (!SUPABASE_URL || !JWT) {

  console.error("Configure SUPABASE_URL e JWT service_role (eyJ...) ou faça supabase login");

  process.exit(1);

}



const supabase = createClient(SUPABASE_URL, JWT, {

  auth: { persistSession: false, autoRefreshToken: false },

});



function parseCsvLine(line, delim = ";") {

  const out = [];

  let cur = "";

  let q = false;

  for (let i = 0; i < line.length; i++) {

    const c = line[i];

    if (c === '"') {

      if (q && line[i + 1] === '"') {

        cur += '"';

        i++;

      } else q = !q;

      continue;

    }

    if (!q && c === delim) {

      out.push(cur);

      cur = "";

      continue;

    }

    cur += c;

  }

  out.push(cur);

  return out;

}



function parseCsv(text) {

  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {

    const vals = parseCsvLine(line);

    const row = {};

    headers.forEach((h, i) => {

      row[h] = vals[i] ?? "";

    });

    return row;

  });

}



function basenameFromUrl(url) {

  if (!url || typeof url !== "string") return null;

  const clean = url.trim().replace(/^["']|["']$/g, "");

  if (!clean) return null;

  const m = clean.match(/([^/?#]+\.(jpg|jpeg|png|webp))/i);

  return m?.[1] ?? null;

}



function storagePath(filename) {

  return `/storage/v1/object/public/${BUCKET}/${filename}`;

}



function normalizeImageUrl(url, uploaded) {

  const name = basenameFromUrl(url);

  if (!name || !uploaded.has(name)) return null;

  return storagePath(name);

}



function parseGallery(raw, uploaded, primary) {

  if (!raw || raw === "[]") return [];

  try {

    const arr = JSON.parse(raw);

    if (!Array.isArray(arr)) return [];

    return [...new Set(arr.map((u) => normalizeImageUrl(u, uploaded)).filter((u) => u && u !== primary))];

  } catch {

    return [];

  }

}



function parseBool(v) {

  return String(v).toLowerCase() === "true";

}



function parseHarmonizacao(raw) {

  if (!raw || raw === "[]") return [];

  try {

    const arr = JSON.parse(raw);

    return Array.isArray(arr) ? arr.map(String) : [];

  } catch {

    return [];

  }

}



function contentTypeFor(name) {

  const ext = path.extname(name).toLowerCase();

  if (ext === ".webp") return "image/webp";

  if (ext === ".png") return "image/png";

  return "image/jpeg";

}



function extractZip(zipPath, destDir) {

  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });

  mkdirSync(destDir, { recursive: true });

  execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "inherit" });

  const files = readdirSync(destDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  return files;

}



async function listRemoteFiles() {

  const names = new Set();

  let offset = 0;

  while (true) {

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {

      method: "POST",

      headers: {

        apikey: JWT,

        Authorization: `Bearer ${JWT}`,

        "Content-Type": "application/json",

      },

      body: JSON.stringify({

        limit: 1000,

        offset,

        prefix: "",

        sortBy: { column: "name", order: "asc" },

      }),

    });

    if (!res.ok) throw new Error(`List storage: ${res.status} ${await res.text()}`);

    const data = await res.json();

    if (!Array.isArray(data) || !data.length) break;

    for (const item of data) {

      if (item?.name && !item.name.startsWith(".")) names.add(item.name);

    }

    if (data.length < 1000) break;

    offset += 1000;

  }

  return names;

}



async function uploadFileRest(name, buf, contentType) {

  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name).replace(/%2F/g, "/")}`;

  const res = await fetch(url, {

    method: "POST",

    headers: {

      apikey: JWT,

      Authorization: `Bearer ${JWT}`,

      "Content-Type": contentType,

      "x-upsert": "true",

    },

    body: buf,

  });

  if (!res.ok) return { error: { message: `${res.status} ${await res.text()}` } };

  return { error: null };

}



async function uploadImages(localFiles) {

  let remote = await listRemoteFiles();

  const pending = localFiles.filter((f) => !remote.has(f));

  console.log(`\n=== Upload imagens: ${pending.length} pendentes (${localFiles.length} no ZIP, ${remote.size} no storage) ===`);

  if (dryRun) return new Set([...remote, ...localFiles]);



  let ok = 0;

  let err = 0;

  const concurrency = 4;

  let i = 0;



  async function worker() {

    while (i < pending.length) {

      const idx = i++;

      const name = pending[idx];

      const buf = readFileSync(path.join(EXTRACT_DIR, name));

      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {

        const { error } = await uploadFileRest(name, buf, contentTypeFor(name));

        if (!error) {

          remote.add(name);

          ok++;

          if (ok % 50 === 0) console.log(`  ${ok}/${pending.length} enviadas...`);

          lastError = null;

          break;

        }

        lastError = error;

        await new Promise((r) => setTimeout(r, attempt * 500));

      }

      if (lastError) {

        err++;

        if (err <= 15) console.error(`  ERRO ${name}: ${lastError.message}`);

      }

    }

  }



  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log(`Upload: ${ok} OK, ${err} erros, ${remote.size} total no storage\n`);

  return remote;

}



function mapRow(row, uploaded) {

  const imageUrl = normalizeImageUrl(row.image_url, uploaded);

  const gallery = parseGallery(row.gallery, uploaded, imageUrl);



  return {

    sku: row.sku?.trim() || null,

    name: row.name?.trim(),

    slug: row.slug?.trim(),

    short_description: row.short_description || null,

    description: row.description || null,

    country: row.country || null,

    region: row.region || null,

    grape: row.grape || null,

    wine_type: row.wine_type || null,

    classification: row.classification || null,

    brand: row.brand || null,

    vintage: row.vintage || null,

    wine_style: row.wine_style || null,

    serving_temp: row.serving_temp || null,

    glass_type: row.glass_type || null,

    decanting: row.decanting || null,

    harmonization: row.harmonization || null,

    visual_notes: row.visual_notes || null,

    nose_notes: row.nose_notes || null,

    palate_notes: row.palate_notes || null,

    vivino_rating: row.vivino_rating ? Number(row.vivino_rating) : null,

    price: Number(row.price) || 0,

    compare_at_price: row.compare_at_price ? Number(row.compare_at_price) : null,

    stock: row.stock ? Number(row.stock) : 0,

    image_url: imageUrl,

    gallery,

    featured: parseBool(row.featured),

    best_seller: parseBool(row.best_seller),

    is_active: parseBool(row.is_active),

    rating: row.rating ? Number(row.rating) : null,

    product_type: row.product_type || null,

    color: row.color || null,

    is_zero_alcohol: parseBool(row.is_zero_alcohol),

    harmonizacao: parseHarmonizacao(row.harmonizacao),

    selo: parseHarmonizacao(row.selo),

    video_url: row.video_url || null,

    aging: row.aging || null,

    alcohol_content: row.alcohol_content || null,

  };

}



async function fetchAllProducts() {

  const all = [];

  const pageSize = 1000;

  let from = 0;

  while (true) {

    const { data, error } = await supabase

      .from("products")

      .select("id, sku, slug, name, is_active, product_type")

      .range(from, from + pageSize - 1);

    if (error) throw error;

    if (!data?.length) break;

    all.push(...data);

    if (data.length < pageSize) break;

    from += pageSize;

  }

  return all;

}



async function syncCategoriesForActiveProducts() {

  console.log("=== Sincronizando categorias dos produtos ativos ===");

  if (dryRun) return;



  const { error } = await supabase.rpc("sync_all_product_categories");

  if (error) {

    // fallback: per-product if bulk RPC missing

    console.warn("RPC sync_all_product_categories indisponível, sincronizando em lotes...");

    let from = 0;

    const pageSize = 200;

    while (true) {

      const { data, error: e2 } = await supabase

        .from("products")

        .select("id")

        .eq("is_active", true)

        .range(from, from + pageSize - 1);

      if (e2) throw e2;

      if (!data?.length) break;

      for (const row of data) {

        await supabase.rpc("sync_product_categories", { _product_id: row.id });

      }

      from += pageSize;

      if (data.length < pageSize) break;

    }

  }

}



async function cleanupCategories() {

  console.log("=== Limpando categorias sem produtos ativos ===");

  if (dryRun) return;



  const sql = `

    UPDATE public.categories c

    SET is_active = false

    WHERE NOT EXISTS (

      SELECT 1

      FROM public.product_categories pc

      JOIN public.products p ON p.id = pc.product_id

      WHERE pc.category_id = c.id AND p.is_active = true

    )

    AND c.slug NOT IN ('so-vinhos', 'combos', 'so-espumantes', 'so-sangrias');

  `;

  // run via supabase db query in shell after script if needed

  const { data: categories } = await supabase.from("categories").select("id, slug");

  const { data: activeLinks } = await supabase

    .from("product_categories")

    .select("category_id, products!inner(is_active)")

    .eq("products.is_active", true);



  const activeCatIds = new Set((activeLinks ?? []).map((l) => l.category_id));

  const protectedSlugs = new Set(["so-vinhos", "combos", "so-espumantes", "so-sangrias"]);

  const toDeactivate = (categories ?? []).filter(

    (c) => !activeCatIds.has(c.id) && !protectedSlugs.has(c.slug),

  );



  if (toDeactivate.length) {

    for (let i = 0; i < toDeactivate.length; i += 50) {

      const chunk = toDeactivate.slice(i, i + 50).map((c) => c.id);

      await supabase.from("categories").update({ is_active: false }).in("id", chunk);

    }

    console.log(`Categorias desativadas: ${toDeactivate.length}`);

  } else {

    console.log("Nenhuma categoria extra para desativar");

  }



  // Reativar categorias que têm produtos ativos

  const toActivate = (categories ?? []).filter((c) => activeCatIds.has(c.id));

  for (let i = 0; i < toActivate.length; i += 50) {

    const chunk = toActivate.slice(i, i + 50).map((c) => c.id);

    await supabase.from("categories").update({ is_active: true }).in("id", chunk);

  }

}



async function main() {

  if (!existsSync(CSV_PATH)) {

    console.error(`CSV não encontrado: ${CSV_PATH}`);

    process.exit(1);

  }

  if (!skipUpload && !existsSync(ZIP_PATH)) {

    console.error(`ZIP não encontrado: ${ZIP_PATH}`);

    process.exit(1);

  }



  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));

  const csvActive = rows.filter((r) => String(r.is_active).toLowerCase() === "true");

  const allowedSkus = new Set(csvActive.map((r) => r.sku.trim().toUpperCase()).filter(Boolean));

  const allowedSlugs = new Set(csvActive.map((r) => r.slug.trim()).filter(Boolean));



  console.log(`CSV: ${rows.length} linhas | Ativos: ${csvActive.length}`);

  if (dryRun) console.log("*** DRY RUN — nenhuma alteração será gravada ***\n");



  let uploaded = await listRemoteFiles();

  if (!skipUpload) {

    const localFiles = extractZip(ZIP_PATH, EXTRACT_DIR);

    console.log(`ZIP extraído: ${localFiles.length} imagens em ${EXTRACT_DIR}`);

    uploaded = await uploadImages(localFiles);

  }



  const allDb = await fetchAllProducts();

  console.log(`DB: ${allDb.length} produtos`);



  const extras = allDb.filter((p) => {

    const sku = (p.sku || "").toUpperCase();

    return sku ? !allowedSkus.has(sku) : !allowedSlugs.has(p.slug);

  });



  console.log(`\n=== Produtos fora do CSV (serão desativados): ${extras.length} ===`);

  const extraTypes = {};

  for (const p of extras) extraTypes[p.product_type || "?"] = (extraTypes[p.product_type || "?"] || 0) + 1;

  console.log("Por tipo:", extraTypes);

  for (const p of extras.slice(0, 10)) {

    console.log(`  - ${p.sku} | ${p.product_type} | ${p.name?.slice(0, 55)}`);

  }

  if (extras.length > 10) console.log(`  ... e mais ${extras.length - 10}`);



  if (!dryRun && extras.length) {

    for (let i = 0; i < extras.length; i += 100) {

      const chunk = extras.slice(i, i + 100).map((p) => p.id);

      const { error } = await supabase.from("products").update({ is_active: false }).in("id", chunk);

      if (error) throw error;

    }

    console.log(`Desativados: ${extras.length}`);

  }



  const mapped = csvActive.map((r) => mapRow(r, uploaded)).filter((r) => r.sku && r.slug && r.name);

  const withImage = mapped.filter((r) => r.image_url).length;

  console.log(`\n=== Upsert ${mapped.length} produtos do CSV (${withImage} com imagem no storage) ===`);



  if (!dryRun) {

    let ok = 0;

    let err = 0;

    const batchSize = 20;

    for (let b = 0; b < mapped.length; b += batchSize) {

      const batch = mapped.slice(b, b + batchSize);

      const { error } = await supabase.from("products").upsert(batch, { onConflict: "slug" });

      if (error) {

        console.error(`Batch ${b}: ${error.message}`);

        err += batch.length;

      } else {

        ok += batch.length;

      }

      if ((b + batchSize) % 200 === 0 || b + batchSize >= mapped.length) {

        console.log(`  ${Math.min(b + batchSize, mapped.length)}/${mapped.length}...`);

      }

    }

    console.log(`Upsert: ${ok} OK, ${err} erros`);



    await syncCategoriesForActiveProducts();

    await cleanupCategories();

  }



  const finalStorage = dryRun ? uploaded : await listRemoteFiles();

  const sorted = [...finalStorage].filter((n) => /^VIN/i.test(n)).sort();

  console.log(`\n=== Resumo final ===`);

  console.log(`Storage: ${finalStorage.size} arquivos`);

  if (sorted.length) console.log(`  primeiro: ${sorted[0]} | último: ${sorted[sorted.length - 1]}`);

  console.log(`Produtos ativos esperados no CSV: ${csvActive.length}`);

  console.log(`Produtos desativados (extras): ${extras.length}`);

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


