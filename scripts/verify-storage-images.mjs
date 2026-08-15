/**
 * Verifica se os arquivos referenciados em image_url existem no Storage.
 * Uso: node scripts/verify-storage-images.mjs [SKU]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const filterSku = process.argv[2]?.toUpperCase();

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const keys = JSON.parse(execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", { encoding: "utf8", cwd: ROOT }));
  return keys.find((k) => k.name === "service_role")?.api_key;
}

function filenameFromPath(url) {
  const m = String(url || "").match(/([^/]+\.(jpg|jpeg|png|webp))$/i);
  return m?.[1] ?? null;
}

loadEnv();
const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, "");
const jwt = resolveJwt();
const supabase = createClient(base, jwt, { auth: { persistSession: false } });

async function checkFile(name) {
  const objectUrl = `${base}/storage/v1/object/public/product-images/${encodeURIComponent(name)}`;
  const renderUrl = `${base}/storage/v1/render/image/public/product-images/${encodeURIComponent(name)}?width=200&format=webp`;
  const objectRes = await fetch(objectUrl);
  const renderRes = await fetch(renderUrl);
  return {
    name,
    object: objectRes.status,
    render: renderRes.status,
    objectOk: objectRes.ok,
    renderOk: renderRes.ok,
  };
}

async function main() {
  let q = supabase.from("products").select("sku, image_url").eq("is_active", true).not("image_url", "is", null);
  if (filterSku) q = q.eq("sku", filterSku);
  const { data, error } = await q;
  if (error) throw error;

  let missing = 0;
  for (const row of data ?? []) {
    const name = filenameFromPath(row.image_url);
    if (!name) continue;
    const r = await checkFile(name);
    const status = r.objectOk ? "OK" : "FALTA NO STORAGE";
    if (!r.objectOk) missing++;
    console.log(`${row.sku} | ${name} | object:${r.object} render:${r.render} | ${status}`);
  }
  if (!filterSku) console.log(`\nSem arquivo no storage: ${missing} / ${data?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
