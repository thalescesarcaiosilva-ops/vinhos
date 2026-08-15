/**
 * Auditoria completa: Storage vs banco vs URLs públicas.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "product-images";
const SITE = "https://vinellevinhos.vercel.app";
const SUPABASE_HOST = "https://zsfhnjrotkbzyikkxmnm.supabase.co";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

import { execSync } from "node:child_process";

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

loadEnv();
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const JWT = resolveJwt();
if (!SUPABASE_URL || !JWT) {
  console.error("Configure SUPABASE_URL e JWT service_role");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, JWT, { auth: { persistSession: false } });

async function listAllStorageFiles() {
  const names = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
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
    for (const item of data) {
      if (item?.name && !item.name.startsWith(".")) names.push(item.name);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return names;
}

async function headUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { status: res.status, type: res.headers.get("content-type")?.split(";")[0] || "" };
  } catch (e) {
    return { status: 0, type: "", error: e.message };
  }
}

async function main() {
  console.log("=== AUDITORIA DE IMAGENS ===\n");

  const storageFiles = await listAllStorageFiles();
  console.log(`Storage API: ${storageFiles.length} arquivos no bucket ${BUCKET}`);

  const products = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("sku,name,slug,image_url,gallery,is_active")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    products.push(...data);
  }
  console.log(`Banco: ${products.length} produtos`);

  const withUrl = products.filter((p) => p.image_url);
  const withoutUrl = products.filter((p) => !p.image_url);
  console.log(`  Com image_url: ${withUrl.length}`);
  console.log(`  Sem image_url: ${withoutUrl.length}`);

  const storageSet = new Set(storageFiles);
  let urlOk = 0;
  let url404 = 0;
  let urlOther = 0;
  let dbButMissingStorage = 0;
  const missingSamples = [];
  const brokenSamples = [];

  for (const p of withUrl) {
    const m = p.image_url.match(/product-images\/([^/?]+)/);
    const fname = m?.[1];
    if (fname && !storageSet.has(fname)) {
      dbButMissingStorage++;
      if (missingSamples.length < 10) missingSamples.push({ sku: p.sku, file: fname });
    }
  }

  // Test sample of 30 products with image_url
  const sample = withUrl.slice(0, 30);
  for (const p of sample) {
    const objectUrl = `${SITE}${p.image_url}`;
    const renderUrl = objectUrl.replace("/object/public/", "/render/image/public/") + "?width=200&format=webp";
    const obj = await headUrl(objectUrl);
    const rnd = await headUrl(renderUrl);
    if (obj.status === 200) urlOk++;
    else if (obj.status === 404) {
      url404++;
      if (brokenSamples.length < 8) brokenSamples.push({ sku: p.sku, object: obj.status, render: rnd.status, url: objectUrl });
    } else urlOther++;
  }

  console.log(`\nDB aponta arquivo ausente no storage: ${dbButMissingStorage}`);
  if (missingSamples.length) {
    console.log("  Exemplos:", missingSamples.map((s) => `${s.sku}→${s.file}`).join(", "));
  }

  console.log(`\nTeste HEAD (amostra ${sample.length} produtos via ${SITE}):`);
  console.log(`  object 200: ${urlOk} | 404: ${url404} | outro: ${urlOther}`);
  if (brokenSamples.length) {
    for (const b of brokenSamples) console.log(`  QUEBRADO ${b.sku}: object=${b.object} render=${b.render}`);
  }

  // Products without image but have storage file?
  let storageOrphan = 0;
  const skuInStorage = new Set(storageFiles.map((f) => f.split("_")[0]));
  for (const p of withoutUrl) {
    if (skuInStorage.has(p.sku)) storageOrphan++;
  }
  console.log(`\nSem image_url mas SKU tem arquivo no storage: ${storageOrphan}`);

  // Direct supabase test
  if (withUrl[0]) {
    const fname = withUrl[0].image_url.match(/product-images\/([^/?]+)/)?.[1];
    if (fname) {
      const direct = `${SUPABASE_HOST}/storage/v1/object/public/${BUCKET}/${fname}`;
      const proxied = `${SITE}/storage/v1/object/public/${BUCKET}/${fname}`;
      const d = await headUrl(direct);
      const pr = await headUrl(proxied);
      console.log(`\nTeste ${fname}:`);
      console.log(`  Supabase direto: ${d.status} (${d.type})`);
      console.log(`  Vercel proxy:    ${pr.status} (${pr.type})`);
    }
  }

  // Wrong mime types in storage
  let wrongMime = 0;
  for (const fname of storageFiles.slice(0, 50)) {
    const res = await headUrl(`${SUPABASE_HOST}/storage/v1/object/public/${BUCKET}/${fname}`);
    if (res.type && !res.type.startsWith("image/")) wrongMime++;
  }
  console.log(`\nArquivos com MIME não-imagem (amostra 50): ${wrongMime}`);

  if (withoutUrl.length) {
    console.log("\nPrimeiros sem image_url:", withoutUrl.slice(0, 8).map((p) => p.sku).join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
