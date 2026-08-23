/**
 * Migra banner-images/* do projeto Supabase legado (zsfhnj...) para Galvao
 * e normaliza categories.banner_image no banco.
 *
 * node scripts/migrate-banner-images.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ROOT, getSupabaseConfig } from "./lib/env.mjs";

const SITE = "https://www.galvaovinhos.com.br";
const BUCKET = "banner-images";
const LEGACY_HOST = "https://zsfhnjrotkbzyikkxmnm.supabase.co";
const TMP = path.join(ROOT, ".tmp", "banner-migrate");

mkdirSync(TMP, { recursive: true });

function contentType(ext) {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function objectPathFromUrl(url) {
  const u = new URL(url);
  const m = u.pathname.match(/\/storage\/v1\/object\/public\/banner-images\/(.+)$/);
  if (!m) throw new Error(`path inválido: ${url}`);
  return m[1];
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  if (!url.includes("aufvvgytbrstsrfomngm")) {
    throw new Error("SUPABASE_URL deve ser o projeto Galvao (aufvvgytbrstsrfomngm)");
  }
  const sb = createClient(url, jwt, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("categories")
    .select("id, slug, banner_image")
    .ilike("banner_image", `%${LEGACY_HOST}%`);
  if (error) throw error;

  const urls = [...new Set((rows ?? []).map((r) => r.banner_image).filter(Boolean))].sort();
  console.log(`Categorias com banner legado: ${rows?.length ?? 0}`);
  console.log(`URLs únicas: ${urls.length}`);

  const map = new Map();
  let uploaded = 0;
  let failed = 0;

  for (const oldUrl of urls) {
    const objectPath = objectPathFromUrl(oldUrl);
    const ext = path.extname(objectPath).toLowerCase() || ".webp";
    const newUrl = `${SITE}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    const local = path.join(TMP, createHash("sha1").update(oldUrl).digest("hex") + ext);

    try {
      if (!existsSync(local)) {
        const res = await fetch(oldUrl, {
          headers: { "User-Agent": "GalvaoVinhos/1.0", Accept: "image/*" },
        });
        if (!res.ok) throw new Error(`download ${res.status}`);
        writeFileSync(local, Buffer.from(await res.arrayBuffer()));
      }
      const body = readFileSync(local);
      const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, body, {
        contentType: contentType(ext),
        upsert: true,
        cacheControl: "31536000",
      });
      if (upErr) throw upErr;
      map.set(oldUrl, newUrl);
      uploaded++;
      console.log(`OK ${uploaded}/${urls.length} ${objectPath}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${oldUrl} → ${e.message || e}`);
    }
  }

  console.log(`Upload: ${uploaded} ok, ${failed} fail`);
  if (map.size === 0) throw new Error("Nenhum banner enviado");

  let updated = 0;
  for (const row of rows ?? []) {
    const next = map.get(row.banner_image);
    if (!next) continue;
    const { error: updErr } = await sb
      .from("categories")
      .update({ banner_image: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) {
      console.error(`UPDATE FAIL ${row.slug}: ${updErr.message}`);
      continue;
    }
    updated++;
    console.log(`DB OK ${row.slug}`);
  }

  const leftover = (
    await sb
      .from("categories")
      .select("id", { count: "exact", head: true })
      .ilike("banner_image", `%zsfhnjrotkbzyikkxmnm%`)
  ).count;

  console.log(`\nResumo: ${updated} categorias; restante legado: ${leftover}`);
  writeFileSync(path.join(TMP, "url-map.json"), JSON.stringify(Object.fromEntries(map), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
