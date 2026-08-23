/**
 * Lista URLs absolutas fora de galvaovinhos.com.br no banco (auditoria GMC).
 * node scripts/audit-external-urls.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./lib/env.mjs";

const ALLOWED = /galvaovinhos\.com\.br/i;

function scanText(text, hits, field, id) {
  if (!text || typeof text !== "string") return;
  const re = /https?:\/\/[^\s"'<>]+/gi;
  for (const m of text.match(re) ?? []) {
    if (!ALLOWED.test(m)) hits.push({ field, id, url: m });
  }
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  const sb = createClient(url, jwt, { auth: { persistSession: false } });
  const hits = [];

  const { data: products } = await sb
    .from("products")
    .select("id, sku, image_url, video_url, description")
    .limit(5000);
  for (const p of products ?? []) {
    scanText(p.image_url, hits, "products.image_url", p.sku ?? p.id);
    scanText(p.video_url, hits, "products.video_url", p.sku ?? p.id);
    scanText(p.description, hits, "products.description", p.sku ?? p.id);
  }

  const { data: categories } = await sb.from("categories").select("slug, banner_image");
  for (const c of categories ?? []) {
    scanText(c.banner_image, hits, "categories.banner_image", c.slug);
  }

  const { data: banners } = await sb.from("banners").select("id, image_url");
  for (const b of banners ?? []) {
    scanText(b.image_url, hits, "banners.image_url", b.id);
  }

  const { data: settings } = await sb.from("store_settings").select("data").eq("id", "singleton").maybeSingle();
  scanText(JSON.stringify(settings?.data ?? {}), hits, "store_settings.data", "singleton");

  const unique = [...new Map(hits.map((h) => [h.url, h])).values()];
  console.log(`URLs externas encontradas: ${unique.length}`);
  for (const h of unique.slice(0, 100)) {
    console.log(`${h.field} [${h.id}] → ${h.url}`);
  }
  if (unique.length > 100) console.log(`… e mais ${unique.length - 100}`);
  process.exit(unique.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
