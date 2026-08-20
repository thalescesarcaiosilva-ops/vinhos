/**
 * Sincroniza catálogo com CSV exportado (fonte Lovable legado).
 * - Mantém ativos apenas produtos do CSV (por SKU)
 * - Normaliza image_url/gallery para /storage/v1/object/public/product-images/...
 * - Nunca grava hosts Lovable absolutos no banco (só paths /storage/...)
 *
 * Uso: node scripts/sync-products-csv.mjs [caminho.csv]
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CSV_PATH = process.argv[2] || "D:\\products-export-2026-06-23_13-52-21.csv";
const BUCKET = "product-images";

const LEGACY_HOSTS = [
  "https://www.galvaovinhos.com.br",
  "http://www.galvaovinhos.com.br",
  "https://dymhoqxfamosdujzorrl.supabase.co",
  "https://aufvvgytbrstsrfomngm.supabase.co",
  "/__l5e/",
  "/src/assets/",
  "/imagens_produtos/",
];

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

loadEnvFile();

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  try {
    const raw = execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    });
    const keys = JSON.parse(raw);
    return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key ?? null;
  } catch {
    return null;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const JWT = resolveJwt();
if (!SUPABASE_URL || !JWT) {
  console.error("Configure SUPABASE_URL e JWT service_role (legacy eyJ...) ou faça supabase login");
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
  if (clean.startsWith("/storage/")) {
    const m = clean.match(/\/product-images\/([^/?#]+)/);
    return m?.[1] ?? null;
  }
  try {
    if (clean.startsWith("http")) return new URL(clean).pathname.split("/").pop() || null;
  } catch {
    /* ignore */
  }
  return clean.split("/").pop() || null;
}

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

/** Normaliza qualquer URL legada para caminho local do site (só filename, sem host Lovable). */
export function normalizeImageUrl(url) {
  const name = basenameFromUrl(url);
  if (!name || !/\.(jpe?g|png|webp)$/i.test(name)) return null;
  return storagePath(name);
}

function parseGallery(raw) {
  if (!raw || raw === "[]") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map(normalizeImageUrl).filter(Boolean))];
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

function mapRow(row) {
  const imageUrl = normalizeImageUrl(row.image_url);
  const galleryRaw = parseGallery(row.gallery);
  const gallery = galleryRaw.filter((u) => u !== imageUrl);

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

async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`CSV não encontrado: ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(await readFile(CSV_PATH, "utf8"));
  console.log(`CSV: ${rows.length} linhas`);

  const allowedSkus = new Set(
    rows.filter((r) => r.sku?.trim()).map((r) => r.sku.trim().toUpperCase()),
  );
  const allowedSlugs = new Set(rows.filter((r) => r.slug?.trim()).map((r) => r.slug.trim()));

  // 1) Desativar produtos que NÃO estão no CSV (por SKU)
  const { data: allProducts } = await supabase.from("products").select("id, sku, slug, is_active");
  const toDeactivate = (allProducts ?? []).filter((p) => {
    const sku = (p.sku || "").toUpperCase();
    return sku ? !allowedSkus.has(sku) : !allowedSlugs.has(p.slug);
  });

  if (toDeactivate.length) {
    const ids = toDeactivate.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error } = await supabase.from("products").update({ is_active: false }).in("id", chunk);
      if (error) throw error;
    }
    console.log(`Desativados: ${toDeactivate.length} produtos fora do CSV`);
  }

  // 2) Upsert produtos do CSV (ativos conforme CSV)
  let ok = 0;
  let err = 0;
  const batchSize = 20;
  const mapped = rows.map(mapRow).filter((r) => r.sku && r.slug && r.name);

  for (let b = 0; b < mapped.length; b += batchSize) {
    const batch = mapped.slice(b, b + batchSize);
    const { error } = await supabase.from("products").upsert(batch, { onConflict: "sku" });
    if (error) {
      console.error(`Batch ${b}: ${error.message}`);
      err += batch.length;
    } else {
      ok += batch.length;
    }
    if ((b + batchSize) % 200 === 0 || b + batchSize >= mapped.length) {
      console.log(`  ${Math.min(b + batchSize, mapped.length)}/${mapped.length} sincronizados...`);
    }
  }

  // 3) Corrigir URLs legadas remanescentes no banco inteiro
  const fixSql = `
UPDATE public.products SET image_url = '/storage/v1/object/public/product-images/' || substring(image_url from '([^/]+\\.(jpg|jpeg|png|webp))$')
WHERE image_url IS NOT NULL AND image_url !~ '^/storage/v1/object/public/product-images/'
  AND image_url ~ '(jpg|jpeg|png|webp)$';
`;
  // Run via supabase db query from shell after script

  console.log(`\nConcluído: ${ok} upserts OK, ${err} erros`);
  console.log("Execute scripts/fix-product-urls.sql para normalizar URLs legadas restantes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
