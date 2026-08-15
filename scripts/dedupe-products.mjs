/**
 * Remove duplicatas de produtos (mesmo SKU) e aplica dados do CSV no registro correto.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CSV_PATH = "D:\\products-export-2026-06-23_13-52-21.csv";
const BUCKET = "product-images";

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  const keys = JSON.parse(
    execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    }),
  );
  return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key;
}

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

loadEnvFile();
const JWT = resolveJwt();
const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, JWT, {
  auth: { persistSession: false },
});

async function listRemoteFiles() {
  const names = new Set();
  let offset = 0;
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, "");
  while (true) {
    const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: JWT, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1000, offset, prefix: "", sortBy: { column: "name", order: "asc" } }),
    });
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    for (const item of data) if (item?.name && !item.name.startsWith(".")) names.add(item.name);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return names;
}

function basenameFromUrl(url) {
  const m = String(url || "").match(/([^/?#]+\.(jpg|jpeg|png|webp))/i);
  return m?.[1] ?? null;
}

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

function primaryImageForSku(sku, uploaded) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const name = `${sku.trim()}_1.${ext}`;
    if (uploaded.has(name)) return storagePath(name);
  }
  return null;
}

function mapRow(row, uploaded) {
  const imageUrl =
    (() => {
      const n = basenameFromUrl(row.image_url);
      return n && uploaded.has(n) ? storagePath(n) : null;
    })() || primaryImageForSku(row.sku, uploaded);

  let gallery = [];
  try {
    gallery = JSON.parse(row.gallery || "[]")
      .map((u) => {
        const n = basenameFromUrl(u);
        return n && uploaded.has(n) ? storagePath(n) : null;
      })
      .filter((u) => u && u !== imageUrl);
  } catch {}

  return {
    sku: row.sku?.trim(),
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
    price: Number(row.price) || 0,
    compare_at_price: row.compare_at_price ? Number(row.compare_at_price) : null,
    stock: row.stock ? Number(row.stock) : 0,
    image_url: imageUrl,
    gallery,
    featured: String(row.featured).toLowerCase() === "true",
    best_seller: String(row.best_seller).toLowerCase() === "true",
    is_active: String(row.is_active).toLowerCase() === "true",
    rating: row.rating ? Number(row.rating) : null,
    product_type: row.product_type || null,
    color: row.color || null,
    is_zero_alcohol: String(row.is_zero_alcohol).toLowerCase() === "true",
    video_url: row.video_url || null,
    aging: row.aging || null,
    alcohol_content: row.alcohol_content || null,
  };
}

async function fetchAllProducts() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("products").select("id, sku, slug").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const uploaded = await listRemoteFiles();
  const csvRows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const csvBySku = new Map(
    csvRows
      .filter((r) => r.sku?.trim())
      .map((r) => [r.sku.trim().toUpperCase(), mapRow(r, uploaded)]),
  );
  const allowedSkus = new Set(csvBySku.keys());

  const all = await fetchAllProducts();
  const bySku = new Map();
  for (const p of all) {
    const sku = (p.sku || "").toUpperCase();
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(p);
  }

  let deleted = 0;
  let updated = 0;

  for (const [sku, rows] of bySku) {
    const csv = csvBySku.get(sku);
    if (!csv) continue;
    const keeper = rows.find((r) => r.slug === csv.slug) || rows[rows.length - 1];
    const dupes = rows.filter((r) => r.id !== keeper.id);

    for (const d of dupes) {
      const { error } = await supabase.from("products").delete().eq("id", d.id);
      if (error) console.error("delete", d.id, error.message);
      else deleted++;
    }

    const { error } = await supabase.from("products").update(csv).eq("id", keeper.id);
    if (error) console.error("update", sku, error.message);
    else updated++;
  }

  // Desativar produtos fora do CSV
  const extras = all.filter((p) => {
    const sku = (p.sku || "").toUpperCase();
    return sku && !allowedSkus.has(sku);
  });
  for (let i = 0; i < extras.length; i += 100) {
    const chunk = extras.slice(i, i + 100).map((p) => p.id);
    await supabase.from("products").update({ is_active: false }).in("id", chunk);
  }

  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);
  const { count: imgCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .not("image_url", "is", null);

  console.log(`Duplicatas removidas: ${deleted}`);
  console.log(`Produtos atualizados: ${updated}`);
  console.log(`Extras desativados: ${extras.length}`);
  console.log(`Ativos: ${count} | Com imagem: ${imgCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
