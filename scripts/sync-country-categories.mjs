/**
 * Cria categorias-país faltantes, marca kind, vincula products → product_categories.
 * node scripts/sync-country-categories.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./lib/env.mjs";

/** label canônico → slug (igual countries.ts) */
const COUNTRY_BY_LABEL = {
  "África do Sul": "africa-do-sul",
  Alemanha: "alemanha",
  Argentina: "argentina",
  Austrália: "australia",
  Áustria: "austria",
  Brasil: "brasil",
  Bulgária: "bulgaria",
  Chile: "chile",
  Eslovênia: "eslovenia",
  Espanha: "espanha",
  "Estados Unidos": "eua",
  França: "franca",
  Israel: "israel",
  Itália: "italia",
  "Macedônia do Norte": "macedonia-do-norte",
  Marrocos: "marrocos",
  Moldávia: "moldavia",
  "Nova Zelândia": "nova-zelandia",
  Portugal: "portugal",
  Uruguai: "uruguai",
};

const ALIASES = {
  EUA: "Estados Unidos",
  USA: "Estados Unidos",
  eua: "Estados Unidos",
};

function canonicalLabel(raw) {
  const t = (raw || "").trim();
  return ALIASES[t] ?? t;
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  if (!url.includes("aufvvgytbrstsrfomngm")) {
    throw new Error("Projeto deve ser Galvao (aufvvgytbrstsrfomngm)");
  }
  const sb = createClient(url, jwt, { auth: { persistSession: false } });

  // 1) Garantir coluna kind (idempotente via SQL se a migration já rodou)
  const { data: existingCats, error: catErr } = await sb
    .from("categories")
    .select("id, slug, name, is_active, sort_order, parent_id");
  if (catErr) throw catErr;

  const bySlug = new Map((existingCats ?? []).map((c) => [c.slug, c]));

  // 2) Países com produtos ativos
  const { data: products, error: prodErr } = await sb
    .from("products")
    .select("id, country, is_active")
    .eq("is_active", true)
    .not("country", "is", null);
  if (prodErr) throw prodErr;

  const needed = new Map(); // slug → label
  for (const p of products ?? []) {
    const label = canonicalLabel(p.country);
    const slug = COUNTRY_BY_LABEL[label];
    if (!slug) {
      console.warn(`Sem slug para country="${p.country}" (canônico="${label}") — ignorado`);
      continue;
    }
    needed.set(slug, label);
  }

  console.log(`Países com produtos ativos: ${needed.size}`);

  let created = 0;
  let sortBase = 200;
  for (const [slug, label] of needed) {
    if (bySlug.has(slug)) {
      const row = bySlug.get(slug);
      if (!row.is_active) {
        await sb.from("categories").update({ is_active: true, updated_at: new Date().toISOString() }).eq("id", row.id);
        console.log(`Reativada: ${slug}`);
      }
      continue;
    }
    const { data: inserted, error: insErr } = await sb
      .from("categories")
      .insert({
        slug,
        name: label,
        is_active: true,
        sort_order: sortBase++,
        description: `Vinhos e espumantes de ${label}`,
        kind: "country",
      })
      .select("id, slug, name")
      .single();
    if (insErr) throw insErr;
    bySlug.set(slug, inserted);
    created++;
    console.log(`Criada: ${slug}`);
  }

  // Garante kind=country nas que já existiam
  await sb
    .from("categories")
    .update({ kind: "country" })
    .in("slug", [...needed.keys()]);
  console.log(`Categorias criadas: ${created}`);

  // 3) Recarregar cats e mapear label → category_id
  const { data: allCats, error: allErr } = await sb.from("categories").select("id, slug, name");
  if (allErr) throw allErr;
  const idBySlug = new Map((allCats ?? []).map((c) => [c.slug, c.id]));

  // 4) Vincular product_categories (país)
  let linked = 0;
  let skipped = 0;
  for (const p of products ?? []) {
    const label = canonicalLabel(p.country);
    const slug = COUNTRY_BY_LABEL[label];
    if (!slug) {
      skipped++;
      continue;
    }
    const categoryId = idBySlug.get(slug);
    if (!categoryId) {
      skipped++;
      continue;
    }
    const { error: linkErr } = await sb.from("product_categories").upsert(
      { product_id: p.id, category_id: categoryId },
      { onConflict: "product_id,category_id", ignoreDuplicates: true },
    );
    if (linkErr) {
      // unique violation → já existe
      if (!String(linkErr.message).includes("duplicate") && linkErr.code !== "23505") {
        console.error(`Link fail ${p.id} → ${slug}:`, linkErr.message);
      }
    } else {
      linked++;
    }
  }
  console.log(`Vínculos país processados: ${linked} (skipped ${skipped})`);

  // 5) Verificação exemplo França + tinto
  const { data: sample } = await sb
    .from("products")
    .select("id, name, country, product_categories(categories(slug))")
    .eq("slug", "vinho-tinto-le-petit-cochonnet-pinot-noir-750ml")
    .maybeSingle();
  if (sample) {
    const slugs = (sample.product_categories ?? []).map((x) => x.categories?.slug).filter(Boolean);
    console.log(`\nExemplo Le Petit Cochonnet: country=${sample.country}; cats=[${slugs.join(", ")}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
