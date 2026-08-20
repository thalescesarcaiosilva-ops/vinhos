/**
 * Sincroniza GTIN (gtin13) da Vinoteca Vinho Prosa para produtos Galvao.
 *
 * Fontes (em ordem):
 *   1. JSON export local (campo gtin)
 *   2. Schema JSON-LD da página do produto em vinotecavinhoprosa.com.br
 *
 * Uso:
 *   node scripts/sync-gtin-from-vinoteca.mjs           # dry-run
 *   node scripts/sync-gtin-from-vinoteca.mjs --apply   # grava no Supabase
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const JSON_PATH =
  process.argv.find((a) => a.endsWith(".json")) ||
  "D:\\importarprodutos\\exportados\\vinoteca_vinhoprosa_20260623_181718_completo.json";
const VINOTECA_BASE = "https://www.vinotecavinhoprosa.com.br";
const CONCURRENCY = 4;
const DELAY_MS = 250;

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
  const keys = JSON.parse(
    execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    }),
  );
  return keys.find((k) => k.name === "service_role")?.api_key;
}

function normalizeGtin(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

function slugFromVinotecaUrl(url) {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "") || null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchGtinFromPage(slug) {
  const res = await fetch(`${VINOTECA_BASE}/${slug}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) return { gtin: null, status: res.status };
  const html = await res.text();
  const m = html.match(/"gtin13"\s*:\s*"(\d{8,14})"/);
  return { gtin: normalizeGtin(m?.[1]), status: res.status };
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
const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const jwt = resolveJwt();
if (!url || !jwt) throw new Error("Missing SUPABASE_URL or service role JWT");

const supabase = createClient(url, jwt, { auth: { persistSession: false } });

function loadJsonGtinBySku() {
  if (!existsSync(JSON_PATH)) {
    console.warn(`JSON não encontrado: ${JSON_PATH}`);
    return new Map();
  }
  const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const map = new Map();
  for (const p of data) {
    const gtin = normalizeGtin(p.gtin);
    if (gtin && p.sku) map.set(p.sku.trim().toUpperCase(), gtin);
  }
  return map;
}

function loadJsonGtinBySlug() {
  if (!existsSync(JSON_PATH)) return new Map();
  const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const map = new Map();
  for (const p of data) {
    const gtin = normalizeGtin(p.gtin);
    const slug = slugFromVinotecaUrl(p.url);
    if (gtin && slug) map.set(slug, gtin);
  }
  return map;
}

async function main() {
  const gtinBySku = loadJsonGtinBySku();
  const gtinBySlug = loadJsonGtinBySlug();
  console.log(`JSON: ${gtinBySku.size} GTINs por SKU (${JSON_PATH})\n`);

  const products = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, slug, name, gtin")
      .eq("is_active", true)
      .range(from, from + 499);
    if (error) throw error;
    if (!data?.length) break;
    products.push(...data);
  }
  console.log(`Produtos ativos: ${products.length}\n`);

  const updates = [];
  const needFetch = [];

  for (const p of products) {
    const current = normalizeGtin(p.gtin);
    if (current) continue;

    const fromSku = p.sku ? gtinBySku.get(p.sku.trim().toUpperCase()) : null;
    const fromSlug = gtinBySlug.get(p.slug);
    const gtin = fromSku || fromSlug || null;

    if (gtin) {
      updates.push({ id: p.id, sku: p.sku, slug: p.slug, gtin, source: fromSku ? "json-sku" : "json-slug" });
    } else {
      needFetch.push(p);
    }
  }

  console.log(`Do JSON: ${updates.length} | Buscar no site: ${needFetch.length}`);

  let fetched = 0;
  let notFound = 0;
  await mapPool(
    needFetch,
    async (p) => {
      await sleep(DELAY_MS);
      const { gtin, status } = await fetchGtinFromPage(p.slug);
      if (gtin) {
        updates.push({ id: p.id, sku: p.sku, slug: p.slug, gtin, source: "web" });
        fetched++;
        console.log(`  ✓ ${p.sku} ${p.slug} → ${gtin}`);
      } else {
        notFound++;
        if (notFound <= 15) console.log(`  − ${p.sku} ${p.slug} (HTTP ${status}, sem gtin13)`);
      }
    },
    CONCURRENCY,
  );
  if (notFound > 15) console.log(`  … e mais ${notFound - 15} sem GTIN (combos/kits)`);

  console.log(`\nTotal a atualizar: ${updates.length} (${updates.filter((u) => u.source === "web").length} do site)`);

  if (!APPLY) {
    console.log("\nExecute com --apply para gravar no banco.");
    return;
  }

  let ok = 0;
  for (const u of updates) {
    const { error } = await supabase.from("products").update({ gtin: u.gtin }).eq("id", u.id);
    if (error) throw error;
    ok++;
  }
  console.log(`\nAtualizados: ${ok}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
