import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[m[1]]) process.env[m[1]] = v;
}
const JWT = JSON.parse(
  execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", { encoding: "utf8", cwd: ROOT }),
).find((k) => k.name === "service_role")?.api_key;
const sb = createClient(process.env.SUPABASE_URL, JWT, { auth: { persistSession: false } });
const HOST = "https://aufvvgytbrstsrfomngm.supabase.co";

const products = [];
for (let f = 0; ; f += 1000) {
  const { data } = await sb.from("products").select("sku,slug,image_url,gallery").range(f, f + 999);
  if (!data?.length) break;
  products.push(...data);
}

async function mime(url) {
  const r = await fetch(`${HOST}${url}`, { method: "HEAD" });
  return { status: r.status, type: r.headers.get("content-type")?.split(";")[0] || "" };
}

const brokenPrimary = [];
const brokenGallery = [];
for (const p of products) {
  if (!p.image_url) { brokenPrimary.push({ sku: p.sku, reason: "no url" }); continue; }
  const m = await mime(p.image_url);
  if (m.status !== 200 || !m.type.startsWith("image/")) {
    brokenPrimary.push({ sku: p.sku, slug: p.slug, status: m.status, type: m.type, url: p.image_url });
  }
  for (const g of p.gallery || []) {
    const gm = await mime(g);
    if (gm.status !== 200 || !gm.type.startsWith("image/")) {
      brokenGallery.push({ sku: p.sku, type: gm.type, url: g });
    }
  }
}

console.log(`Produtos com imagem principal quebrada: ${brokenPrimary.length}`);
for (const b of brokenPrimary.slice(0, 20)) console.log(" ", b);
