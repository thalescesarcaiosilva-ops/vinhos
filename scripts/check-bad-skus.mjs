const bad = ["VIN005_2.jpg","VIN009_3.jpg","VIN030_3.jpg","VIN044_2.jpg","VIN052_2.jpg","VIN077_3.jpg"];
const skus = new Set(bad.map((f) => f.split("_")[0]));
console.log("SKUs with bad gallery files:", [...skus]);

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
const JWT = JSON.parse(execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", { encoding: "utf8", cwd: ROOT })).find((k) => k.name === "service_role")?.api_key;
const sb = createClient(process.env.SUPABASE_URL, JWT);
const HOST = "https://aufvvgytbrstsrfomngm.supabase.co";

for (const sku of skus) {
  const { data } = await sb.from("products").select("sku,image_url,gallery").eq("sku", sku).single();
  const r = await fetch(`${HOST}${data.image_url}`, { method: "HEAD" });
  console.log(sku, "primary:", data.image_url, r.status, r.headers.get("content-type"));
}
