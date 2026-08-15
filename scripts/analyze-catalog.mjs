/**
 * Compara CSV Lovable vs banco Supabase vs ZIP de imagens.
 * Uso: node scripts/analyze-catalog.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CSV_PATH = "D:\\products-export-2026-06-23_13-52-21.csv";
const ZIP_PATH = "D:\\bucket-product-images-files.zip";

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
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const JWT = resolveJwt();
const supabase = createClient(SUPABASE_URL, JWT, { auth: { persistSession: false } });

function imageNameFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/([^/]+\.(jpg|jpeg|png|webp))/i);
  return m?.[1] ?? null;
}

async function listStorage() {
  const names = new Set();
  let offset = 0;
  const base = SUPABASE_URL.replace(/\/$/, "");
  while (true) {
    const res = await fetch(`${base}/storage/v1/object/list/product-images`, {
      method: "POST",
      headers: {
        apikey: JWT,
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 1000, offset, prefix: "", sortBy: { column: "name", order: "asc" } }),
    });
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    for (const item of data) if (item?.name) names.add(item.name);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return names;
}

function listZipImages(zipPath) {
  const out = execSync(`tar -tf "${zipPath}"`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return new Set(
    out
      .split(/\r?\n/)
      .map((line) => line.replace(/^.*[\\/]/, "").trim())
      .filter((n) => /\.(jpe?g|png|webp)$/i.test(n)),
  );
}

async function main() {
  const csvRows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const csvActive = csvRows.filter((r) => String(r.is_active).toLowerCase() === "true");
  const csvSkus = new Set(csvActive.map((r) => r.sku.trim().toUpperCase()).filter(Boolean));

  const zipImages = listZipImages(ZIP_PATH);
  const { data: dbProducts } = await supabase.from("products").select("id, sku, slug, name, is_active, product_type");
  const dbActive = (dbProducts ?? []).filter((p) => p.is_active);
  const dbSkus = new Set(dbActive.map((p) => (p.sku || "").toUpperCase()).filter(Boolean));

  const onlyDb = dbActive.filter((p) => !csvSkus.has((p.sku || "").toUpperCase()));
  const onlyCsv = csvActive.filter((r) => !dbSkus.has(r.sku.trim().toUpperCase()));
  const inBoth = csvActive.filter((r) => dbSkus.has(r.sku.trim().toUpperCase()));

  const csvImages = new Set();
  for (const r of csvActive) {
    const n = imageNameFromUrl(r.image_url);
    if (n) csvImages.add(n);
    try {
      for (const u of JSON.parse(r.gallery || "[]")) {
        const g = imageNameFromUrl(u);
        if (g) csvImages.add(g);
      }
    } catch {}
  }

  const storage = await listStorage();
  const storageList = [...storage].sort();

  console.log("=== PRODUTOS ===");
  console.log(`CSV total: ${csvRows.length} | CSV ativos: ${csvActive.length}`);
  console.log(`DB total: ${dbProducts?.length ?? 0} | DB ativos: ${dbActive.length}`);
  console.log(`Em ambos: ${inBoth.length}`);
  console.log(`Só no DB (extras/errados): ${onlyDb.length}`);
  console.log(`Só no CSV (faltam no DB): ${onlyCsv.length}`);

  const dbTypes = {};
  for (const p of onlyDb) dbTypes[p.product_type || "?"] = (dbTypes[p.product_type || "?"] || 0) + 1;
  console.log("\nExtras no DB por tipo:", dbTypes);
  console.log("\nExemplos extras no DB (max 15):");
  for (const p of onlyDb.slice(0, 15)) {
    console.log(`  ${p.sku} | ${p.product_type} | ${p.name?.slice(0, 60)}`);
  }

  console.log("\n=== IMAGENS ===");
  console.log(`ZIP: ${zipImages.size} arquivos`);
  console.log(`CSV referencia: ${csvImages.size} arquivos`);
  console.log(`Storage remoto: ${storage.size} arquivos`);
  if (storageList.length) {
    console.log(`Storage primeiro: ${storageList[0]} | último: ${storageList[storageList.length - 1]}`);
  }

  const zipNotStorage = [...zipImages].filter((n) => !storage.has(n));
  const csvNotZip = [...csvImages].filter((n) => !zipImages.has(n));
  const csvNotStorage = [...csvImages].filter((n) => !storage.has(n));

  console.log(`ZIP não no storage: ${zipNotStorage.length}`);
  console.log(`CSV referencia mas não no ZIP: ${csvNotZip.length}`);
  console.log(`CSV referencia mas não no storage: ${csvNotStorage.length}`);

  const { data: categories } = await supabase.from("categories").select("id, slug, name, is_active");
  console.log("\n=== CATEGORIAS ===");
  console.log(`DB categorias: ${categories?.length ?? 0}`);
  const csvTypes = {};
  for (const r of csvActive) csvTypes[r.product_type || "?"] = (csvTypes[r.product_type || "?"] || 0) + 1;
  console.log("Tipos no CSV:", csvTypes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
