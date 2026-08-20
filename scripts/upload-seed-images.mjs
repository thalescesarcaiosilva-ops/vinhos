/**
 * Upload imagens do pacote seed para o NOVO projeto (env, não .env do repo).
 *
 * Uso (PowerShell):
 *   $env:SEED_SUPABASE_URL="https://aufvvgytbrstsrfomngm.supabase.co"
 *   $env:SEED_SUPABASE_KEY="<anon ou service_role do NOVO projeto>"
 *   node scripts/upload-seed-images.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const url = (process.env.SEED_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SEED_SUPABASE_KEY || "";
const dir = path.join(ROOT, "exports", "galvao-supabase-seed", "storage", "product-images");
const CONCURRENCY = 4;

if (!url || !key) {
  console.error("Defina SEED_SUPABASE_URL e SEED_SUPABASE_KEY (somente do projeto novo).");
  process.exit(1);
}
if (!url.includes("aufvvgytbrstsrfomngm")) {
  console.error("Recusado: URL deve apontar para o projeto Galvao (aufvvgytbrstsrfomngm).");
  process.exit(1);
}

function walk(base, prefix = "") {
  const out = [];
  for (const name of readdirSync(path.join(base, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(path.join(base, rel));
    if (st.isDirectory()) out.push(...walk(base, rel));
    else out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function upload(rel) {
  const filePath = path.join(dir, ...rel.split("/"));
  const target = `${url}/storage/v1/object/product-images/${rel
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const body = readFileSync(filePath);
  const res = await fetch(target, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    return { rel, ok: false, status: res.status, error: (await res.text()).slice(0, 200) };
  }
  return { rel, ok: true };
}

async function main() {
  if (!existsSync(dir)) throw new Error(`Missing ${dir}`);
  const files = walk(dir);
  console.log(`Uploading ${files.length} files to ${url} ...`);
  const results = await mapPool(files, CONCURRENCY, async (rel, idx) => {
    if (idx > 0 && idx % 100 === 0) console.log(`  ${idx}/${files.length}`);
    let attempt = await upload(rel);
    if (!attempt.ok && attempt.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      attempt = await upload(rel);
    }
    return attempt;
  });
  const failed = results.filter((r) => !r.ok);
  console.log(`OK=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) console.log(JSON.stringify(failed.slice(0, 15), null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
