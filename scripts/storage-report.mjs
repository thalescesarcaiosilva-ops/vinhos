/**
 * Relatório rápido: Storage vs banco vs URLs públicas.
 * Uso: node scripts/storage-report.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "product-images";
const SITE = "https://vinellevinhos.vercel.app";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  return JSON.parse(
    execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", { encoding: "utf8", cwd: ROOT }),
  ).find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key;
}

loadEnv();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const JWT = resolveJwt();
const sb = createClient(SUPABASE_URL, JWT, { auth: { persistSession: false } });

async function listFiles() {
  const names = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: JWT, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 1000, offset, prefix: "", sortBy: { column: "name", order: "asc" } }),
    });
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    names.push(...data.map((x) => x.name).filter((n) => n && !n.startsWith(".")));
    if (data.length < 1000) break;
  }
  return names;
}

async function head(url) {
  const r = await fetch(url, { method: "HEAD", redirect: "follow" });
  return r.status;
}

const files = await listFiles();
const { count: products } = await sb.from("products").select("*", { count: "exact", head: true });
const { count: withImg } = await sb.from("products").select("*", { count: "exact", head: true }).not("image_url", "is", null);

const { data: sample } = await sb.from("products").select("sku,image_url,slug").limit(1).single();
const testUrl = sample ? `${SITE}${sample.image_url}` : null;

console.log("═══════════════════════════════════════");
console.log("  RELATÓRIO STORAGE — Vinelle");
console.log("═══════════════════════════════════════");
console.log(`Arquivos no bucket (API):  ${files.length}`);
console.log(`Produtos no banco:         ${products}`);
console.log(`Produtos com image_url:    ${withImg}`);
console.log(`\nNota: o painel Supabase mostra ~100–200 itens por página.`);
console.log(`      Isso NÃO é limite do plano Free (limite = 1 GB total).`);
if (testUrl) {
  const ok = await head(testUrl);
  console.log(`\nTeste ao vivo (${sample.sku}):`);
  console.log(`  ${testUrl}`);
  console.log(`  HTTP ${ok}`);
}
console.log("═══════════════════════════════════════");
