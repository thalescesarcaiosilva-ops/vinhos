import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[m[1]]) process.env[m[1]] = v;
}
const JWT = JSON.parse(
  execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", { encoding: "utf8", cwd: ROOT }),
).find((k) => k.name === "service_role")?.api_key;
const sb = createClient(process.env.SUPABASE_URL, JWT, { auth: { persistSession: false } });

const { data: sample } = await sb.from("products").select("slug,sku,image_url,name").limit(3);
console.log("Sample products:", sample);

const home = await fetch("https://vinellevinhos.vercel.app/");
console.log("Home status:", home.status);
const homeHtml = await home.text();
console.log("Home has product-images:", homeHtml.includes("product-images"));
console.log("Home has storage/v1:", homeHtml.includes("/storage/v1/"));

if (sample?.[0]) {
  const url = `https://vinellevinhos.vercel.app/produto/${sample[0].slug}`;
  const r = await fetch(url);
  const html = await r.text();
  console.log(`\nProduct ${sample[0].sku} (${url}):`, r.status);
  console.log("  has image_url path:", html.includes(sample[0].image_url?.replace(/^\//, "") || "___"));
  console.log("  has product-images:", html.includes("product-images"));
  const imgMatch = html.match(/src="([^"]*product-images[^"]*)"/);
  console.log("  first img src:", imgMatch?.[1] || "NONE");
}

// storage count via API default limit vs paginated
const res1 = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/list/product-images`, {
  method: "POST",
  headers: { apikey: JWT, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
  body: JSON.stringify({ limit: 100, offset: 0 }),
});
const d1 = await res1.json();
console.log("\nStorage list limit=100 returns:", Array.isArray(d1) ? d1.length : d1);
