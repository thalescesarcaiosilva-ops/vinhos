/**
 * Normaliza image_url e gallery para /storage/v1/object/public/product-images/{arquivo}
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const keys = JSON.parse(
    execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    }),
  );
  return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key;
}

function filenameFromUrl(url) {
  const m = String(url || "").match(/([^/?#]+\.(jpg|jpeg|png|webp))/i);
  return m?.[1] ?? null;
}

function storagePath(filename) {
  return `/storage/v1/object/public/product-images/${filename}`;
}

function normalizeGallery(gallery) {
  if (!Array.isArray(gallery)) return [];
  const out = [];
  for (const item of gallery) {
    const name = filenameFromUrl(item);
    if (!name) continue;
    const path = storagePath(name);
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

loadEnv();
const jwt = resolveJwt();
const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, jwt, {
  auth: { persistSession: false },
});

async function fetchAll() {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, image_url, gallery")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const rows = await fetchAll();
  let updated = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    for (const row of chunk) {
      const name = filenameFromUrl(row.image_url);
      const image_url = name ? storagePath(name) : null;
      const gallery = normalizeGallery(row.gallery);
      const same =
        row.image_url === image_url && JSON.stringify(row.gallery ?? []) === JSON.stringify(gallery);
      if (same) continue;
      const { error } = await supabase.from("products").update({ image_url, gallery }).eq("id", row.id);
      if (error) console.error(row.sku, error.message);
      else updated++;
    }
    if ((i + 25) % 200 === 0) console.log(`${Math.min(i + 25, rows.length)}/${rows.length}...`);
  }
  console.log(`Normalizados: ${updated} produtos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
