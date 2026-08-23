/**
 * Corrige URLs externas restantes (auditoria item 2).
 * - banners com host supabase.co → galvaovinhos.com.br
 * - banner Chile em postimg.cc → Storage Galvao
 *
 * node scripts/fix-external-urls.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./lib/env.mjs";

const SITE = "https://www.galvaovinhos.com.br";
const CHILE_OLD = "https://i.postimg.cc/dtXY3bRy/chile-(1).webp";
const CHILE_PATH = "chile-migrated.webp";

async function main() {
  const { url, jwt } = getSupabaseConfig();
  const sb = createClient(url, jwt, { auth: { persistSession: false } });

  const { data: banners } = await sb.from("banners").select("id, image_url");
  for (const b of banners ?? []) {
    if (b.image_url?.includes("aufvvgytbrstsrfomngm.supabase.co")) {
      const next = b.image_url.replace(
        "https://aufvvgytbrstsrfomngm.supabase.co",
        SITE,
      );
      await sb.from("banners").update({ image_url: next }).eq("id", b.id);
      console.log(`banner ${b.id} → site URL`);
    }
  }

  const { data: chile } = await sb
    .from("categories")
    .select("id, banner_image")
    .eq("slug", "chile")
    .maybeSingle();
  if (chile?.banner_image?.includes("postimg.cc")) {
    const res = await fetch(CHILE_OLD, { headers: { Accept: "image/*" } });
    if (!res.ok) throw new Error(`Chile download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { error: upErr } = await sb.storage.from("banner-images").upload(CHILE_PATH, buf, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "31536000",
    });
    if (upErr) throw upErr;
    const newUrl = `${SITE}/storage/v1/object/public/banner-images/${CHILE_PATH}`;
    await sb
      .from("categories")
      .update({ banner_image: newUrl, updated_at: new Date().toISOString() })
      .eq("id", chile.id);
    console.log("Chile banner migrado");
  } else {
    console.log("Chile banner já ok");
  }

  const { data: settingsRow } = await sb.from("store_settings").select("data").eq("id", "singleton").single();
  if (settingsRow?.data) {
    let raw = JSON.stringify(settingsRow.data);
    if (raw.includes("/pagina/")) {
      raw = raw.replaceAll("/pagina/", "/politicas/");
      await sb
        .from("store_settings")
        .update({ data: JSON.parse(raw), updated_at: new Date().toISOString() })
        .eq("id", "singleton");
      console.log("store_settings: /pagina/ → /politicas/");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
