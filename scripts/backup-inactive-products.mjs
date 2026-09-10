#!/usr/bin/env node
/**
 * Snapshot somente-leitura de slug/preço dos produtos inativos, gravado em
 * scripts/data/backups/. Serve de rede de segurança antes de renomear slugs e
 * baixar preços — e de fonte para o --restore.
 *
 *   node scripts/backup-inactive-products.mjs
 *   node scripts/backup-inactive-products.mjs --restore scripts/data/backups/<arquivo>.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();
const headers = { apikey: jwt, Authorization: `Bearer ${jwt}` };
const BACKUP_DIR = path.join(process.cwd(), "scripts", "data", "backups");
const COLS = "id,sku,name,slug,price,compare_at_price,is_active";

async function fetchAllInactive() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/products?select=${COLS}&is_active=is.false&order=slug&limit=${pageSize}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function backup() {
  const rows = await fetchAllInactive();
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(BACKUP_DIR, `inactive-products-${stamp}.json`);
  await writeFile(file, JSON.stringify({ takenAt: new Date().toISOString(), rows }, null, 2));
  console.log(`${rows.length} produtos inativos salvos em ${path.relative(process.cwd(), file)}`);
}

async function restore(file) {
  const { rows } = JSON.parse(await readFile(file, "utf8"));
  let done = 0;
  for (const row of rows) {
    const res = await fetch(`${url}/rest/v1/products?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        slug: row.slug,
        price: row.price,
        compare_at_price: row.compare_at_price,
      }),
    });
    if (!res.ok) {
      console.error(`  erro ${row.slug}: HTTP ${res.status} ${await res.text()}`);
      continue;
    }
    done += 1;
  }
  console.log(`${done}/${rows.length} produtos restaurados ao estado do backup`);
}

const restoreIdx = process.argv.indexOf("--restore");
if (restoreIdx !== -1) {
  const file = process.argv[restoreIdx + 1];
  if (!file) throw new Error("Informe o arquivo: --restore <caminho.json>");
  await restore(file);
} else {
  await backup();
}
