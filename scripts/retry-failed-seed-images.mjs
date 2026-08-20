/**
 * Aplica chunks SQL de products/links/suggestions no NOVO projeto via Management... não.
 * Usa REST? Não — usa pg via supabase... 
 * Na prática: gera um único script Node que chama execute via fetch to... 
 *
 * Alternativa: usa @supabase/supabase-js com service role.
 * Aqui: importa via PostgREST upsert com SEED_* env (anon não passa RLS de insert admin).
 *
 * Melhor caminho sem service_role: ler cada SQL chunk e imprimir tamanho;
 * a importação real continua via MCP execute_sql.
 *
 * Este arquivo: retry upload das 5 imagens falhas + lista chunks a aplicar.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/env.mjs";

const FAIL = [
  "espumante-garibaldi-prosecco-rose-750ml.png",
  "VIN590_1.jpg",
  "VIN794_6.jpg",
  "vinho-la-vache-tinto-750ml.webp",
  "vinho-luiz-argenta-jovem-rose-750ml.jpg",
];

const url = (process.env.SEED_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SEED_SUPABASE_KEY || "";
const dir = path.join(ROOT, "exports", "galvao-supabase-seed", "storage", "product-images");

async function upload(rel) {
  const filePath = path.join(dir, rel);
  if (!existsSync(filePath)) return { rel, ok: false, error: "missing file" };
  const target = `${url}/storage/v1/object/product-images/${encodeURIComponent(rel)}`;
  const body = readFileSync(filePath);
  console.log(rel, "bytes", body.length);
  for (let i = 0; i < 4; i++) {
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
    if (res.ok) return { rel, ok: true, attempt: i + 1 };
    const err = (await res.text()).slice(0, 180);
    console.log(rel, "fail", res.status, err);
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return { rel, ok: false };
}

async function main() {
  if (!url || !key || !url.includes("aufvvgytbrstsrfomngm")) throw new Error("bad env");
  const results = [];
  for (const rel of FAIL) {
    results.push(await upload(rel));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
