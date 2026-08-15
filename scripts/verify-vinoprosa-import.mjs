import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) {
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

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { count: total } = await sb.from("products").select("*", { count: "exact", head: true });
const { count: active } = await sb
  .from("products")
  .select("*", { count: "exact", head: true })
  .eq("is_active", true);
const { count: withImg } = await sb
  .from("products")
  .select("*", { count: "exact", head: true })
  .not("image_url", "is", null);

const types = {};
const countries = {};
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from("products").select("product_type,country").range(from, from + 999);
  if (!data?.length) break;
  for (const r of data) {
    types[r.product_type] = (types[r.product_type] || 0) + 1;
    if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
  }
}

const { data: cats } = await sb.from("categories").select("slug,name").order("slug");
const { count: links } = await sb.from("product_categories").select("*", { count: "exact", head: true });

console.log("=== Catálogo Vinoprosa ===");
console.log(`Produtos: ${total} (${active} ativos)`);
console.log(`Com image_url: ${withImg}`);
console.log("Tipos:", types);
console.log(
  "Países:",
  Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(", "),
);
console.log(`Categorias: ${cats?.length} | vínculos: ${links}`);
console.log("Slugs:", cats?.map((c) => c.slug).join(", "));
