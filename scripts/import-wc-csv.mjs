/**
 * Importa produtos de export WooCommerce CSV para Supabase.
 * Uso: node scripts/import-wc-csv.mjs [caminho.csv]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";
import { loadWcProducts, slugify } from "./lib/wc-csv-parser.mjs";

const BUCKET = "product-images";
const CSV_PATH = process.argv[2] || "c:/Users/rodri/Downloads/wc-product-export-11-7-2026-1783804805511.csv";
const CONCURRENCY = 4;

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

function imageFilename(slug, remoteUrl) {
  let ext = ".jpg";
  try {
    const u = new URL(remoteUrl);
    const e = path.extname(u.pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(e)) ext = e === ".jpeg" ? ".jpg" : e;
  } catch { /* ignore */ }
  return `${slug}${ext}`;
}

function contentTypeFor(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function uploadFileRest(baseUrl, jwt, name, buf, contentType) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodeURIComponent(name).replace(/%2F/g, "/")}`, {
    method: "POST",
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) return { error: `${res.status} ${await res.text()}` };
  return { error: null };
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "VinelleImport/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error("arquivo muito pequeno");
  return buf;
}

async function fetchExistingSlugs(url, jwt) {
  const slugs = new Set();
  let from = 0;
  while (true) {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/products?select=slug&offset=${from}&limit=1000`, {
      headers: { apikey: jwt, Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data?.length) break;
    for (const r of data) slugs.add(r.slug);
    if (data.length < 1000) break;
    from += 1000;
  }
  return slugs;
}

async function insertProduct(url, jwt, row) {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/products`, {
    method: "POST",
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) return { error: await res.text() };
  return { error: null };
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  used.add(slug);
  return slug;
}

async function main() {
  const { url, jwt } = getSupabaseConfig();

  console.log(`Lendo CSV: ${CSV_PATH}`);
  const products = loadWcProducts(CSV_PATH);
  console.log(`Produtos no CSV: ${products.length}`);

  const usedSlugs = await fetchExistingSlugs(url, jwt);
  console.log(`Slugs existentes no banco: ${usedSlugs.size}`);

  const imageCache = new Map();
  const usedFilenames = new Set();
  let imgOk = 0, imgErr = 0;
  const pendingImages = products.filter((p) => p.image_remote);
  console.log(`Baixando/upload de ${pendingImages.length} imagens...`);

  function uniqueFilename(slug, remoteUrl) {
    let name = imageFilename(slug, remoteUrl);
    let n = 2;
    while (usedFilenames.has(name)) {
      const ext = path.extname(name);
      const stem = path.basename(name, ext);
      name = `${stem}-${n}${ext}`;
      n++;
    }
    usedFilenames.add(name);
    return name;
  }

  let idx = 0;
  async function imageWorker() {
    while (idx < pendingImages.length) {
      const i = idx++;
      const p = pendingImages[i];
      const fname = uniqueFilename(slugify(p.name), p.image_remote);
      try {
        const buf = await downloadImage(p.image_remote);
        const { error } = await uploadFileRest(url, jwt, fname, buf, contentTypeFor(fname));
        if (error) throw new Error(error);
        imageCache.set(p.image_remote, { fname, url: storagePath(fname) });
        imgOk++;
        if (imgOk % 25 === 0) console.log(`  imagens: ${imgOk}/${pendingImages.length}`);
      } catch (e) {
        imgErr++;
        imageCache.set(p.image_remote, { error: String(e.message || e) });
        if (imgErr <= 10) console.warn(`  IMG ERRO ${p.name}: ${e.message || e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => imageWorker()));
  console.log(`Imagens: ${imgOk} OK, ${imgErr} erros`);

  const insertSlugs = await fetchExistingSlugs(url, jwt);
  let ok = 0, err = 0;
  const errors = [];
  const log = [];

  for (const p of products) {
    const slug = uniqueSlug(p.slug, insertSlugs);
    const img = p.image_remote ? imageCache.get(p.image_remote) : null;
    const imageUrl = img?.url ?? null;

    const row = {
      name: p.name,
      slug,
      sku: p.sku,
      gtin: p.gtin,
      price: p.price,
      compare_at_price: null,
      stock: p.stock,
      description: p.description,
      short_description: p.short_description,
      country: p.country,
      region: p.region,
      grape: p.grape,
      wine_type: p.wine_type,
      brand: p.brand,
      alcohol_content: p.alcohol_content,
      serving_temp: p.serving_temp,
      visual_notes: p.visual_notes,
      nose_notes: p.nose_notes,
      palate_notes: p.palate_notes,
      harmonization: p.harmonization,
      harmonizacao: p.harmonizacao,
      image_url: imageUrl,
      gallery: [],
      featured: false,
      best_seller: false,
      is_active: p.is_active,
      product_type: p.product_type,
    };

    const { error } = await insertProduct(url, jwt, row);
    if (error) {
      err++;
      errors.push({ name: p.name, slug, message: error });
      if (err <= 15) console.error(`ERRO ${p.name}: ${error.slice(0, 200)}`);
    } else {
      ok++;
      log.push({ wc_id: p.wc_id, slug, name: p.name, price: p.price, image: imageUrl });
      if (ok % 50 === 0) console.log(`  produtos: ${ok}/${products.length}`);
    }
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = path.join("scripts", "data", "backups");
  mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `import-wc-log-${ts}.json`);
  writeFileSync(logPath, JSON.stringify({ ok, err, errors, imported: log }, null, 2));

  console.log(`\nConcluído: ${ok} importados, ${err} erros`);
  console.log(`Log: ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
