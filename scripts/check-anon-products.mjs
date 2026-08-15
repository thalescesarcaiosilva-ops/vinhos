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

const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data, error } = await anon.from("products").select("sku,image_url,name").eq("is_active", true).limit(5);
console.log("Anon query error:", error);
console.log("Sample:", data);

const { count: withImg } = await anon.from("products").select("*", { count: "exact", head: true }).not("image_url", "is", null);
const { count: total } = await anon.from("products").select("*", { count: "exact", head: true }).eq("is_active", true);
console.log(`Anon sees: ${withImg}/${total} with image_url`);
