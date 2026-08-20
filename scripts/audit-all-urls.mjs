import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.galvaovinhos.com.br";

function loadEnv() {
  for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();
const JWT = JSON.parse(
  execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", { encoding: "utf8", cwd: ROOT }),
).find((k) => k.name === "service_role")?.api_key;
const sb = createClient(process.env.SUPABASE_URL, JWT, { auth: { persistSession: false } });

async function head(url) {
  const r = await fetch(url, { method: "HEAD", redirect: "follow" });
  return r.status;
}

const products = [];
for (let f = 0; ; f += 1000) {
  const { data } = await sb.from("products").select("sku,image_url,slug").range(f, f + 999);
  if (!data?.length) break;
  products.push(...data);
}

let objOk = 0, obj404 = 0, rndOk = 0, rndFail = 0;
const broken = [];
for (const p of products) {
  const obj = `${SITE}${p.image_url}`;
  const rnd = obj.replace("/object/public/", "/render/image/public/") + "?width=400&format=webp";
  const os = await head(obj);
  const rs = await head(rnd);
  if (os === 200) objOk++; else { obj404++; if (broken.length < 15) broken.push({ sku: p.sku, status: os, slug: p.slug }); }
  if (rs === 200) rndOk++; else rndFail++;
}

console.log(`Total: ${products.length}`);
console.log(`object URL: ${objOk} ok, ${obj404} fail`);
console.log(`render URL: ${rndOk} ok, ${rndFail} fail`);
if (broken.length) console.log("Broken:", broken);
