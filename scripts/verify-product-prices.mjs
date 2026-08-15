import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m || line.trimStart().startsWith("#")) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const jwt =
  process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY?.startsWith("eyJ")
    ? process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(process.env.SUPABASE_URL, jwt, { auth: { persistSession: false } });

const { count } = await sb.from("products").select("*", { count: "exact", head: true }).not("compare_at_price", "is", null);
const { count: discounted } = await sb
  .from("products")
  .select("*", { count: "exact", head: true })
  .not("compare_at_price", "is", null)
  .filter("compare_at_price", "gt", "price");

console.log("Produtos com compare_at_price:", count ?? 0);
console.log("Produtos com desconto visível (compare > price):", discounted ?? 0);
