import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildProductPlainDescription, normalizeGtin, productSkuIdentifier, resolveProductBrandName } from "@/lib/product-seo";
import { toMerchantImageUrl, toSiteImageUrl } from "@/lib/image-url";
import { absoluteSiteUrl, toAbsoluteImageUrl } from "@/lib/site-url";
import { STORE } from "@/lib/settings";

type FeedProduct = {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  price: number;
  stock: number;
  brand: string | null;
  country: string | null;
  wine_type: string | null;
  image_url: string | null;
  gallery: string[] | null;
  gtin: string | null;
  product_type: Database["public"]["Enums"]["product_type_enum"] | null;
  is_zero_alcohol: boolean | null;
  product_categories: Array<{ categories: { name: string } | null }> | null;
};

/**
 * IDs oficiais da taxonomia Google (en-US):
 * https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 * Não usar g:adult para álcool — a documentação do Merchant proíbe.
 */
const GPC = {
  alcoholicBeverages: "499676",
  wine: "421",
  beer: "414",
  liquor: "417",
  juice: "2887",
  barware: "649",
  stemware: "2712",
  corkscrews: "2976",
  decanters: "650",
  cookingOils: "2126",
  candy: "4748",
  olives: "5760",
  foodItems: "422",
} as const;

function googleProductCategoryId(p: FeedProduct): string {
  const name = (p.name ?? "").toLowerCase();
  const type = p.product_type;

  if (p.is_zero_alcohol) return GPC.juice;

  if (type === "suco") return GPC.juice;
  if (type === "cerveja") return GPC.beer;
  if (type === "destilado") return GPC.liquor;
  if (type === "vinho" || type === "espumante" || type === "sangria") return GPC.wine;
  if (type === "kit") return GPC.alcoholicBeverages;

  if (type === "acessorio") {
    if (/ta[cç]a|stemware|copo/.test(name)) return GPC.stemware;
    if (/saca.?rolha|corkscrew|abridor/.test(name)) return GPC.corkscrews;
    if (/decantador|decanter/.test(name)) return GPC.decanters;
    return GPC.barware;
  }

  if (type === "gourmet") {
    if (/azeite|olive oil/.test(name)) return GPC.cookingOils;
    if (/chocolate/.test(name)) return GPC.candy;
    if (/azeitona|conserva|pickle/.test(name)) return GPC.olives;
    return GPC.foodItems;
  }

  // Fallback por nome (inclui product_type=outro)
  if (/cerveja|beer|ipa|lager|pilsen/.test(name)) return GPC.beer;
  if (/whisky|whiskey|vodka|\bgin\b|\brum\b|tequila|cacha[cç]a|conhaque|cognac|licor|pisco|brandy/.test(name)) {
    return GPC.liquor;
  }
  if (/ta[cç]a|copo|decanter|saca.?rolha|abridor|dosador|coqueteleira/.test(name)) return GPC.barware;
  if (/azeite|xarope|monin/.test(name)) return GPC.foodItems;
  if (/suco|juice/.test(name)) return GPC.juice;
  if (/vinho|espumante|champagne|prosecco|cava/.test(name)) return GPC.wine;
  return GPC.alcoholicBeverages;
}

function getPublicSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for product feed.");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: string): string {
  return `<![CDATA[ ${value.replace(/\]\]>/g, "]]]]><![CDATA[>")} ]]>`;
}

function formatPriceBrl(price: number): string {
  return `${Number(price).toFixed(2)} BRL`;
}

function productDescription(p: FeedProduct): string {
  return buildProductPlainDescription(p);
}

/** Breadcrumb estável para g:product_type (Google Merchant). */
function productType(p: FeedProduct): string {
  const name = (p.name ?? "").toLowerCase();
  const type = p.product_type;
  const catNames = new Set(
    (p.product_categories ?? [])
      .map((pc) => pc.categories?.name?.trim())
      .filter(Boolean) as string[],
  );

  const pick = (...candidates: string[]) => candidates.find((c) => catNames.has(c));

  if (type === "vinho") {
    const color = pick("Tintos", "Brancos", "Rosés") || p.wine_type || "Vinhos";
    return `Bebidas > Vinhos > ${color}`;
  }
  if (type === "espumante") {
    const color = pick("Brancos", "Rosés") || "Espumantes";
    return `Bebidas > Espumantes > ${color}`;
  }
  if (type === "sangria") return "Bebidas > Sangrias";
  if (type === "cerveja") return "Bebidas > Cervejas";
  if (type === "suco") return "Bebidas > Sucos";
  if (type === "kit") return "Bebidas > Kits e Combos";
  if (type === "destilado") {
    const sub =
      pick(
        "Whisky",
        "Gin",
        "Vodka",
        "Rum",
        "Tequila",
        "Cachaça",
        "Licor",
        "Conhaque e Brandy",
        "Pisco",
        "Outros destilados",
      ) ||
      (/whisky|whiskey|bourbon|scotch/.test(name)
        ? "Whisky"
        : /\bgin\b/.test(name)
          ? "Gin"
          : /vodka/.test(name)
            ? "Vodka"
            : /\brum\b|rhum/.test(name)
              ? "Rum"
              : /tequila|mezcal/.test(name)
                ? "Tequila"
                : /cacha[cç]a/.test(name)
                  ? "Cachaça"
                  : /licor|liqueur/.test(name)
                    ? "Licor"
                    : /conhaque|cognac|brandy/.test(name)
                      ? "Conhaque e Brandy"
                      : /pisco/.test(name)
                        ? "Pisco"
                        : "Outros destilados");
    return `Bebidas > Destilados > ${sub}`;
  }
  if (type === "acessorio") {
    if (pick("Taças") || /ta[cç]a|copo|stemware/.test(name)) {
      return "Casa e Jardim > Bar e Adega > Taças";
    }
    return "Casa e Jardim > Bar e Adega > Acessórios";
  }
  if (type === "gourmet") {
    if (/azeite/.test(name)) return "Alimentos > Azeites";
    if (/xarope|monin|pure monin/.test(name)) return "Alimentos > Xaropes";
    return "Alimentos > Gourmet";
  }

  if (catNames.size > 0) {
    const ordered = ["Destilados", "Só Vinhos", "Só Espumantes", "Combos", "Acessórios", "Gourmet", "Cervejas"]
      .filter((c) => catNames.has(c));
    if (ordered.length) return ordered.join(" > ");
  }

  const parts = [p.wine_type, p.country].filter(Boolean);
  return parts.length > 0 ? parts.join(" > ") : "Bebidas > Vinhos";
}

function resolveGtin(p: FeedProduct): string | null {
  const fromColumn = normalizeGtin(p.gtin);
  if (fromColumn) return fromColumn;
  if (!p.sku) return null;
  const digits = p.sku.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

function feedItemXml(p: FeedProduct): string {
  const id = productSkuIdentifier(p.sku) || p.sku?.trim() || p.id;
  const link = absoluteSiteUrl(`/produto/${p.slug}`);
  const image = toAbsoluteImageUrl(toMerchantImageUrl(p.image_url)) ?? "";
  const gallery = Array.isArray(p.gallery) ? p.gallery : [];
  const additionalImages = gallery
    .map((u) => toAbsoluteImageUrl(toMerchantImageUrl(u)))
    .filter((u): u is string => Boolean(u) && u !== image);
  const gtin = resolveGtin(p);
  const skuId = productSkuIdentifier(p.sku);
  const availability = p.stock > 0 ? "in_stock" : "out_of_stock";
  const brand = resolveProductBrandName(p.name, p.brand, p.country);
  const desc = productDescription(p);
  const type = productType(p);
  const gpc = googleProductCategoryId(p);

  const lines = [
    "<item>",
    ` <g:id>${escapeXml(id)}</g:id>`,
    ` <g:title>${escapeXml(p.name.slice(0, 150))}</g:title>`,
    ` <g:description>${escapeXml(desc)}</g:description>`,
    ` <g:link>${escapeXml(link)}</g:link>`,
    ` <g:product_type>${cdata(type)}</g:product_type>`,
    ` <g:google_product_category>${gpc}</g:google_product_category>`,
  ];

  if (image) lines.push(` <g:image_link>${escapeXml(image)}</g:image_link>`);
  for (const extra of additionalImages.slice(0, 10)) {
    lines.push(` <g:additional_image_link>${escapeXml(extra)}</g:additional_image_link>`);
  }
  lines.push(
    ` <g:condition>new</g:condition>`,
    ` <g:availability>${availability}</g:availability>`,
    ` <g:price>${formatPriceBrl(p.price)}</g:price>`,
  );
  if (brand) {
    lines.push(` <g:brand>${escapeXml(brand.slice(0, 70))}</g:brand>`);
  }

  // Google: identifier_exists=yes quando há GTIN e/ou (MPN + brand).
  // Com MPN+brand e identifier_exists=no o Merchant marca conflito.
  if (gtin) {
    lines.push(` <g:gtin>${escapeXml(gtin)}</g:gtin>`);
    if (skuId) lines.push(` <g:mpn>${escapeXml(skuId)}</g:mpn>`);
    lines.push(` <g:identifier_exists>yes</g:identifier_exists>`);
  } else if (skuId && brand) {
    lines.push(` <g:mpn>${escapeXml(skuId)}</g:mpn>`);
    lines.push(` <g:identifier_exists>yes</g:identifier_exists>`);
  } else {
    // Sem GTIN e sem par MPN+marca: declarar explicitamente que não há identificador.
    lines.push(` <g:identifier_exists>no</g:identifier_exists>`);
  }

  lines.push(
    ` <g:item_group_id>${escapeXml(id)}</g:item_group_id>`,
    ` <g:is_bundle>no</g:is_bundle>`,
    "</item>",
  );

  return lines.join("\n");
}

export function getProductFeedPath(): string {
  return "/product-feed.xml";
}

export function getProductFeedAbsoluteUrl(): string {
  return absoluteSiteUrl("/product-feed.xml");
}

export async function buildProductFeedXml(): Promise<string> {
  const supabase = getPublicSupabase();
  const siteLink = absoluteSiteUrl("/");
  const storeName = STORE.name;

  const items: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sku, slug, name, description, short_description, price, stock, brand, country, wine_type, image_url, gallery, gtin, product_type, is_zero_alcohol, product_categories(categories(name))",
      )
      .eq("is_active", true)
      .order("name")
      .range(from, from + 499);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data as FeedProduct[]) {
      items.push(feedItemXml(row as FeedProduct));
    }
    if (data.length < 500) break;
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" xmlns:c="http://base.google.com/cns/1.0" version="2.0">',
    "<channel>",
    `<title>${cdata(storeName)}</title>`,
    `<link>${cdata(siteLink)}</link>`,
    `<description>${cdata(`Feed de produtos ${storeName} — Google Merchant / WebToffee`)}</description>`,
    items.join("\n"),
    "</channel>",
    "</rss>",
  ].join("\n");
}
