import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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

const url = process.env.SUPABASE_URL;
const keys = [
  ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
  ["SUPABASE_LEGACY_SERVICE_ROLE_KEY", process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY],
];

for (const [label, key] of keys) {
  if (!key) {
    console.log(`${label}: not set`);
    continue;
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.from("orders").select("id").limit(1);
  console.log(`${label} (${key.slice(0, 16)}...): ${error?.message ?? "OK"}`);
}
