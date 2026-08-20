/**
 * Remove do banco URLs de imagem inexistentes ou com content-type inválido (ex.: .jpg que é vídeo).
 * Uso:
 *   node scripts/prune-broken-product-images.mjs           # dry-run
 *   node scripts/prune-broken-product-images.mjs --apply   # grava no Supabase
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const SITE = (process.env.PUBLIC_SITE_URL || "https://www.galvaovinhos.com.br").replace(/\/$/, "");
const CONCURRENCY = 25;

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function toAbsolute(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    const m = url.match(/(\/storage\/v1\/object\/public\/.+)$/i);
    return m ? `${SITE}${m[1]}` : url;
  }
  return `${SITE}${url.startsWith("/") ? url : `/${url}`}`;
}

async function isValidImageUrl(url) {
  const abs = toAbsolute(url);
  if (!abs) return false;
  try {
    const res = await fetch(abs, { method: "HEAD", redirect: "follow" });
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    return res.ok && ct.startsWith("image/");
  } catch {
    return false;
  }
}

async function mapPool(items, fn, limit) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

loadEnv();
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or service role key in .env");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function cleanProduct(row) {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  const checks = await Promise.all([
    row.image_url ? isValidImageUrl(row.image_url).then((ok) => ({ url: row.image_url, ok, kind: "primary" })) : null,
    ...gallery.map((g) => isValidImageUrl(g).then((ok) => ({ url: g, ok, kind: "gallery" }))),
  ]);

  const validGallery = [];
  const removed = [];

  for (const c of checks) {
    if (!c) continue;
    if (c.kind === "gallery") {
      if (c.ok) validGallery.push(c.url);
      else removed.push(c.url);
    }
  }

  let imageUrl = row.image_url;
  const primaryCheck = checks[0];
  if (primaryCheck && !primaryCheck.ok) {
    removed.push(primaryCheck.url);
    imageUrl = validGallery[0] ?? null;
    if (imageUrl) validGallery.shift();
  } else if (!imageUrl && validGallery.length > 0) {
    imageUrl = validGallery.shift();
  }

  const galleryChanged =
    validGallery.length !== gallery.length || validGallery.some((u, i) => u !== gallery[i]);
  const imageChanged = imageUrl !== row.image_url;

  if (!galleryChanged && !imageChanged) return null;

  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    image_url: imageUrl,
    gallery: validGallery,
    removed,
  };
}

async function main() {
  const products = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, slug, image_url, gallery")
      .eq("is_active", true)
      .range(from, from + 499);
    if (error) throw error;
    if (!data?.length) break;
    products.push(...data);
  }

  console.log(`Verificando ${products.length} produtos (${APPLY ? "APLICAR" : "dry-run"})…\n`);

  const updates = (await mapPool(products, cleanProduct, CONCURRENCY)).filter(Boolean);

  let removedUrls = 0;
  for (const u of updates) {
    removedUrls += u.removed.length;
    console.log(`${u.sku} | -${u.removed.length} | primary: ${u.image_url?.split("/").pop() ?? "—"}`);
    for (const r of u.removed) console.log(`  ✗ ${r.split("/").pop()}`);
  }

  console.log(`\nProdutos a atualizar: ${updates.length}`);
  console.log(`URLs removidas: ${removedUrls}`);

  if (!APPLY) {
    console.log("\nExecute com --apply para gravar no banco.");
    return;
  }

  let ok = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("products")
      .update({ image_url: u.image_url, gallery: u.gallery })
      .eq("id", u.id);
    if (error) throw error;
    ok++;
  }
  console.log(`\nAtualizados: ${ok}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
