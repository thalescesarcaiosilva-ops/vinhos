/**
 * Remove desconto de todos os produtos: preço de venda = preço cheio (o maior).
 * Zera compare_at_price para não exibir preço riscado.
 */
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

function resolveJwt() {
  const legacy = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY;
  if (legacy?.startsWith("eyJ")) return legacy;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  return sk;
}

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const jwt = resolveJwt();
if (!url || !jwt) {
  console.error("Configure SUPABASE_URL e SUPABASE_LEGACY_SERVICE_ROLE_KEY (eyJ...) em .env");
  process.exit(1);
}

const sb = createClient(url, jwt, { auth: { persistSession: false } });

const PAGE = 1000;
let offset = 0;
let scanned = 0;
let updated = 0;
let skipped = 0;

while (true) {
  const { data, error } = await sb
    .from("products")
    .select("id, sku, price, compare_at_price")
    .range(offset, offset + PAGE - 1);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data?.length) break;

  for (const row of data) {
    scanned++;
    const price = Number(row.price) || 0;
    const compare = row.compare_at_price != null ? Number(row.compare_at_price) : null;
    const full = compare != null && compare > price ? compare : price;
    const needsUpdate = compare != null && (compare > price || compare !== null);

    if (compare == null) {
      skipped++;
      continue;
    }

    const { error: upErr } = await sb
      .from("products")
      .update({ price: full, compare_at_price: null })
      .eq("id", row.id);
    if (upErr) {
      console.error(row.sku ?? row.id, upErr.message);
      process.exit(1);
    }
    updated++;
  }

  if (data.length < PAGE) break;
  offset += PAGE;
}

console.log(`Produtos verificados: ${scanned}`);
console.log(`Atualizados (desconto removido): ${updated}`);
console.log(`Já sem compare_at_price: ${skipped}`);
