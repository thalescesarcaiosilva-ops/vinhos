/**
 * Sincroniza catálogo com CSV corrigido: apenas produtos do CSV ficam ativos.
 * Uso: node scripts/sync-corrected-csv.mjs [caminho.csv]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";
import { loadWcProducts, slugify, stripHtml } from "./lib/wc-csv-parser.mjs";

const CSV_PATH = process.argv[2] || "c:/Users/rodri/Downloads/produtos_corrigidos.csv";
const BUCKET = "product-images";
const CONCURRENCY = 4;

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

function toPlainText(html) {
  if (!html) return null;
  const t = html.replace(/\\n/g, "\n").replace(/\\r/g, "");
  if (!/<[a-z]/i.test(t)) return t.trim() || null;
  return stripHtml(t) || null;
}

function imageFilename(slug, remoteUrl) {
  let ext = ".jpg";
  try {
    const e = path.extname(new URL(remoteUrl).pathname).toLowerCase();
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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAllProducts(url, jwt) {
  const all = [];
  let from = 0;
  while (true) {
    const batch = await rest(url, jwt, `/rest/v1/products?select=id,sku,slug,image_url,is_active&offset=${from}&limit=1000`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function uploadImage(url, jwt, fname, remoteUrl) {
  const res = await fetch(remoteUrl, {
    headers: { "User-Agent": "GalvaoImport/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const up = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodeURIComponent(fname).replace(/%2F/g, "/")}`, {
    method: "POST",
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": contentTypeFor(fname),
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!up.ok) throw new Error(await up.text());
  return storagePath(fname);
}

function buildRow(p, imageUrl) {
  return {
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    gtin: p.gtin,
    price: p.price,
    compare_at_price: null,
    stock: p.stock,
    description: toPlainText(p.description),
    short_description: toPlainText(p.short_description),
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
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  console.log(`CSV: ${CSV_PATH}`);

  let csvProducts = loadWcProducts(CSV_PATH);
  console.log(`Linhas no CSV: ${csvProducts.length}`);

  // Dedupe CSV por SKU
  const bySku = new Map();
  for (const p of csvProducts) {
    if (!p.sku) continue;
    bySku.set(p.sku, p);
  }
  csvProducts = [...bySku.values()];
  console.log(`Produtos únicos (SKU): ${csvProducts.length}`);

  const csvSkus = new Set(csvProducts.map((p) => p.sku));

  const dbProducts = await fetchAllProducts(url, jwt);
  console.log(`Produtos no banco: ${dbProducts.length}`);

  const byDbSku = new Map();
  const byDbSlug = new Map();
  const duplicateDbIds = [];
  for (const p of dbProducts) {
    if (p.slug) byDbSlug.set(p.slug, p);
    if (!p.sku) continue;
    if (byDbSku.has(p.sku)) duplicateDbIds.push(p.id);
    else byDbSku.set(p.sku, p);
  }

  async function claimSlug(slug, ownerId, ownerSku) {
    const taken = byDbSlug.get(slug);
    if (taken && taken.id !== ownerId) {
      const legacySlug = `${slug}-${(taken.sku || taken.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await rest(url, jwt, `/rest/v1/products?id=eq.${taken.id}`, {
        method: "PATCH",
        body: JSON.stringify({ slug: legacySlug }),
        headers: { Prefer: "return=minimal" },
      });
      byDbSlug.delete(slug);
      byDbSlug.set(legacySlug, { ...taken, slug: legacySlug });
    }
    byDbSlug.set(slug, { id: ownerId, sku: ownerSku, slug });
    return slug;
  }

  const keptIds = new Set();
  let updated = 0, inserted = 0, imgOk = 0, imgErr = 0, errors = 0;

  // Reservar slugs dos produtos que serão mantidos
  const usedSlugs = new Set(
    csvProducts.map((p) => byDbSku.get(p.sku)?.slug).filter(Boolean),
  );

  function uniqueSlug(base) {
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug) || byDbSlug.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    usedSlugs.add(slug);
    return slug;
  }

  // Processar imagens em lote (só quando necessário)
  const imageCache = new Map();
  let imgIdx = 0;
  const needImages = csvProducts.filter((p) => p.image_remote);

  async function imageWorker() {
    while (imgIdx < needImages.length) {
      const i = imgIdx++;
      const p = needImages[i];
      const existing = byDbSku.get(p.sku);
      if (existing?.image_url?.includes("/product-images/")) {
        imageCache.set(p.sku, existing.image_url);
        continue;
      }
      const fname = imageFilename(slugify(p.name), p.image_remote);
      try {
        const imageUrl = await uploadImage(url, jwt, fname, p.image_remote);
        imageCache.set(p.sku, imageUrl);
        imgOk++;
        if (imgOk % 25 === 0) console.log(`  imagens: ${imgOk}`);
      } catch (e) {
        imgErr++;
        if (imgErr <= 5) console.warn(`  IMG ${p.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => imageWorker()));
  console.log(`Imagens: ${imgOk} OK, ${imgErr} erros`);

  for (const p of csvProducts) {
    const existing = byDbSku.get(p.sku);
    const slug = await claimSlug(p.slug, existing?.id ?? "new", p.sku);
    const imageUrl = imageCache.get(p.sku) ?? existing?.image_url ?? null;
    const row = buildRow({ ...p, slug }, imageUrl);

    try {
      if (existing) {
        await rest(url, jwt, `/rest/v1/products?id=eq.${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(row),
          headers: { Prefer: "return=minimal" },
        });
        keptIds.add(existing.id);
        updated++;
      } else {
        const created = await rest(url, jwt, `/rest/v1/products`, {
          method: "POST",
          body: JSON.stringify(row),
          headers: { Prefer: "return=representation" },
        });
        if (created?.[0]?.id) keptIds.add(created[0].id);
        inserted++;
      }
      if ((updated + inserted) % 100 === 0) console.log(`  sync: ${updated + inserted}/${csvProducts.length}`);
    } catch (e) {
      errors++;
      if (errors <= 10) console.error(`ERRO ${p.name}: ${e.message}`);
    }
  }

  // Desativar duplicatas no banco (mesmo SKU)
  for (const id of duplicateDbIds) {
    if (!keptIds.has(id)) {
      await rest(url, jwt, `/rest/v1/products?id=eq.${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
        headers: { Prefer: "return=minimal" },
      });
    }
  }

  // Desativar tudo que não está no CSV
  let deactivated = 0;
  for (const p of dbProducts) {
    if (keptIds.has(p.id)) continue;
    if (p.sku && csvSkus.has(p.sku)) continue;
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
      headers: { Prefer: "return=minimal" },
    });
    deactivated++;
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = path.join("scripts", "data", "backups");
  mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `sync-corrected-log-${ts}.json`);
  writeFileSync(logPath, JSON.stringify({
    csv: csvProducts.length,
    updated,
    inserted,
    deactivated,
    duplicateDbDeactivated: duplicateDbIds.length,
    errors,
    imgOk,
    imgErr,
    keptActive: keptIds.size,
  }, null, 2));

  console.log(`\nConcluído:`);
  console.log(`  Atualizados: ${updated}`);
  console.log(`  Inseridos: ${inserted}`);
  console.log(`  Desativados (fora do CSV): ${deactivated}`);
  console.log(`  Ativos no catálogo: ${keptIds.size}`);
  console.log(`  Log: ${logPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
