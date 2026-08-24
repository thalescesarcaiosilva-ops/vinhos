import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { countries } from "@/lib/countries";
import { PRICE_RANGES } from "@/lib/collection-products";

/** Aliases de país no banco → label canônico em countries.ts */
export const COUNTRY_DB_ALIASES: Record<string, string> = {
  EUA: "Estados Unidos",
};

const labelToSlug = new Map(countries.map((c) => [c.label, c.slug]));

export type ActiveCollections = {
  /** Slugs de categorias reais com ≥1 produto ativo */
  categorySlugs: Set<string>;
  /** Slugs de país com ≥1 produto ativo */
  countrySlugs: Set<string>;
  /** Labels de país (canônicos) com produtos */
  countryLabels: Set<string>;
  /** Faixas de preço com produtos */
  priceSlugs: Set<string>;
  /** Coleções virtuais com produtos (todos, outlet, …) */
  virtualSlugs: Set<string>;
};

function emptyActive(): ActiveCollections {
  return {
    categorySlugs: new Set(),
    countrySlugs: new Set(),
    countryLabels: new Set(),
    priceSlugs: new Set(),
    virtualSlugs: new Set(),
  };
}

/** True se a coleção `/colecao/{slug}` tem produtos ativos. */
export function collectionHasProducts(slug: string, active: ActiveCollections): boolean {
  if (active.categorySlugs.has(slug)) return true;
  if (active.countrySlugs.has(slug)) return true;
  if (active.priceSlugs.has(slug)) return true;
  if (active.virtualSlugs.has(slug)) return true;
  return false;
}

export async function fetchActiveCollections(): Promise<ActiveCollections> {
  const result = emptyActive();

  const { data: catRows, error: catErr } = await supabase
    .from("product_categories")
    .select("categories!inner(slug, is_active), products!inner(is_active)")
    .eq("categories.is_active", true)
    .eq("products.is_active", true);
  if (catErr) throw catErr;
  for (const row of catRows ?? []) {
    const cat = row.categories as { slug: string } | null;
    if (cat?.slug) result.categorySlugs.add(cat.slug);
  }

  const { data: countryRows, error: countryErr } = await supabase
    .from("products")
    .select("country")
    .eq("is_active", true)
    .not("country", "is", null);
  if (countryErr) throw countryErr;
  for (const row of countryRows ?? []) {
    const raw = row.country?.trim();
    if (!raw) continue;
    const label = COUNTRY_DB_ALIASES[raw] ?? raw;
    result.countryLabels.add(label);
    const slug = labelToSlug.get(label);
    if (slug) result.countrySlugs.add(slug);
  }

  for (const [slug, range] of Object.entries(PRICE_RANGES)) {
    let q = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (range.min != null) q = q.gte("price", range.min);
    if (range.max != null) q = q.lte("price", range.max);
    const { count, error } = await q;
    if (error) throw error;
    if ((count ?? 0) > 0) result.priceSlugs.add(slug);
  }

  const { count: todosCount, error: todosErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (todosErr) throw todosErr;
  if ((todosCount ?? 0) > 0) result.virtualSlugs.add("todos");

  const { count: outletCount, error: outletErr } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .not("compare_at_price", "is", null);
  if (outletErr) throw outletErr;
  if ((outletCount ?? 0) > 0) result.virtualSlugs.add("outlet");

  return result;
}

export function useActiveCollections() {
  return useQuery({
    queryKey: ["active-collections"],
    queryFn: fetchActiveCollections,
    staleTime: 5 * 60_000,
  });
}
