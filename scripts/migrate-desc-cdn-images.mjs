/**
 * Baixa imagens vinotecavinhoprosa.cdn das descriptions, sobe no Storage Galvao
 * e troca as URLs para https://www.galvaovinhos.com.br/storage/...
 *
 * node scripts/migrate-desc-cdn-images.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { ROOT, getSupabaseConfig } from "./lib/env.mjs";

const SITE = "https://www.galvaovinhos.com.br";
const BUCKET = "product-images";
const PREFIX = "desc-cdn";
const TMP = path.join(ROOT, ".tmp", "desc-cdn");
const CDN_RE = /https?:\/\/vinotecavinhoprosa\.cdn\.magazord\.com\.br[^\s"'<>]+/gi;

mkdirSync(TMP, { recursive: true });

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/\.(jpe?g|png|webp|gif|svg)$/i);
    return m ? m[0].toLowerCase().replace("jpeg", "jpg") : ".jpg";
  } catch {
    return ".jpg";
  }
}

function storagePathFor(url) {
  const u = new URL(url);
  // /img/2023/06/banner/83/franca.png → desc-cdn/2023/06/banner/83/franca.png
  let rel = u.pathname.replace(/^\/img\//, "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) {
    const h = createHash("sha1").update(url).digest("hex").slice(0, 16);
    rel = `_hash/${h}${extFromUrl(url)}`;
  }
  return `${PREFIX}/${rel}`;
}

function contentType(ext) {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  if (!url.includes("aufvvgytbrstsrfomngm")) {
    throw new Error("SUPABASE_URL deve ser o projeto Galvao (aufvvgytbrstsrfomngm)");
  }
  const sb = createClient(url, jwt, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("products")
    .select("id, sku, name, description")
    .ilike("description", "%vinotecavinhoprosa.cdn.magazord.com.br%");
  if (error) throw error;

  const urlSet = new Set();
  for (const row of rows ?? []) {
    const matches = row.description?.match(CDN_RE) ?? [];
    for (const m of matches) urlSet.add(m);
  }
  const urls = [...urlSet].sort();
  console.log(`Produtos: ${rows?.length ?? 0}`);
  console.log(`URLs únicas: ${urls.length}`);

  const map = new Map(); // oldUrl -> newUrl
  let uploaded = 0;
  let failed = 0;

  for (const oldUrl of urls) {
    const objectPath = storagePathFor(oldUrl);
    const ext = path.extname(objectPath).toLowerCase() || ".jpg";
    const newUrl = `${SITE}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    const local = path.join(TMP, createHash("sha1").update(oldUrl).digest("hex") + ext);

    try {
      if (!existsSync(local)) {
        const res = await fetch(oldUrl, {
          headers: { "User-Agent": "GalvaoVinhos/1.0", Accept: "image/*" },
        });
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(local, buf);
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
  if (map.size === 0) throw new Error("Nenhuma imagem enviada");

  let updated = 0;
  for (const row of rows ?? []) {
    let next = row.description;
    let changed = false;
    for (const [oldUrl, newUrl] of map) {
      if (next.includes(oldUrl)) {
        next = next.split(oldUrl).join(newUrl);
        changed = true;
      }
    }
    if (!changed) continue;
    const { error: updErr } = await sb
      .from("products")
      .update({ description: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updErr) {
      console.error(`UPDATE FAIL ${row.sku}: ${updErr.message}`);
      continue;
    }
    updated++;
    console.log(`DESC OK ${row.sku}`);
  }

  const leftover = (
    await sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .ilike("description", "%vinotecavinhoprosa.cdn.magazord.com.br%")
  ).count;

  console.log(`\nResumo: ${updated} descriptions atualizadas; restante com CDN: ${leftover}`);
  writeFileSync(
    path.join(TMP, "url-map.json"),
    JSON.stringify(Object.fromEntries(map), null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
