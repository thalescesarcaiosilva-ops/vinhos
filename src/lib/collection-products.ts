import { supabase } from "@/integrations/supabase/client";
import { getCountry } from "@/lib/countries";
import { countryDbValuesForLabel } from "@/lib/country-aliases";
import type { Product } from "@/components/store/ProductCard";
import type { Database } from "@/integrations/supabase/types";

export const COLLECTION_PRODUCT_COLUMNS =
  "id, name, slug, price, compare_at_price, image_url, country, grape, wine_type, rating, best_seller";

export type CollectionSort = "recent" | "price_asc" | "price_desc" | "name" | "best_seller";

export const PRICE_RANGES: Record<string, { min?: number; max?: number; label: string }> = {
  "ate-100": { max: 100, label: "Até R$ 100" },
  "100-200": { min: 100, max: 200, label: "R$ 100 a R$ 200" },
  "200-300": { min: 200, max: 300, label: "R$ 200 a R$ 300" },
  "acima-300": { min: 300, label: "Acima de R$ 300" },
};

type CollectionProductQuery = ReturnType<typeof createCollectionProductQuery>;

function createCollectionProductQuery(client: typeof supabase) {
  return client.from("products").select(COLLECTION_PRODUCT_COLUMNS).eq("is_active", true);
}

type VFilter = {
  label: string;
  apply: (query: CollectionProductQuery) => CollectionProductQuery;
};

export const VIRTUAL_FILTERS: Record<string, VFilter> = {
  todos: { label: "Todos os produtos", apply: (q) => q },
  outlet: { label: "Outlet — Ofertas", apply: (q) => q.not("compare_at_price", "is", null) },
  sobremesa: {
    label: "Vinhos de Sobremesa",
    apply: (q) =>
      q.or(
        "name.ilike.%sobremesa%,name.ilike.%dessert%,name.ilike.%late harvest%,name.ilike.%moscatel%",
      ),
  },
  fortificados: {
    label: "Vinhos Fortificados",
    apply: (q) =>
      q.or(
        "name.ilike.%porto%,name.ilike.%jerez%,name.ilike.%sherry%,name.ilike.%madeira%,name.ilike.%fortificado%",
      ),
  },
  "sem-alcool": {
    label: "Sem Álcool",
    apply: (q) =>
      q.or(
        "name.ilike.%sem álcool%,name.ilike.%sem alcool%,name.ilike.%zero álcool%,name.ilike.%zero alcool%,name.ilike.%0,0%,name.ilike.%non-alcoholic%",
      ),
  },
  destilados: {
    label: "Destilados",
    apply: (q) =>
      q.or(
        "name.ilike.%whisky%,name.ilike.%whiskey%,name.ilike.%vodka%,name.ilike.%gin%,name.ilike.%rum%,name.ilike.%tequila%,name.ilike.%cachaça%,name.ilike.%conhaque%,name.ilike.%cognac%",
      ),
  },
  cervejas: {
    label: "Cervejas",
    apply: (q) =>
      q.or(
        "name.ilike.%cerveja%,name.ilike.%beer%,name.ilike.%ipa%,name.ilike.%lager%,name.ilike.%pilsen%,name.ilike.%stout%",
      ),
  },
  sucos: {
    label: "Sucos",
    apply: (q) => q.or("name.ilike.%suco%,name.ilike.%juice%,name.ilike.%uva integral%"),
  },
  acessorios: {
    label: "Acessórios",
    apply: (q) =>
      q.or(
        "name.ilike.%acessório%,name.ilike.%acessorio%,name.ilike.%taça%,name.ilike.%taca%,name.ilike.%saca-rolha%,name.ilike.%decantador%,name.ilike.%abridor%",
      ),
  },
  tacas: {
    label: "Taças",
    apply: (q) => q.or("name.ilike.%taça%,name.ilike.%taca%,name.ilike.%glass%,name.ilike.%copo%"),
  },
  "saca-rolhas": {
    label: "Saca-rolhas",
    apply: (q) =>
      q.or(
        "name.ilike.%saca-rolha%,name.ilike.%saca rolha%,name.ilike.%corkscrew%,name.ilike.%abridor%",
      ),
  },
  decantadores: {
    label: "Decantadores",
    apply: (q) => q.or("name.ilike.%decantador%,name.ilike.%decanter%"),
  },
  azeites: { label: "Azeites", apply: (q) => q.or("name.ilike.%azeite%,name.ilike.%olive oil%") },
  conservas: {
    label: "Conservas",
    apply: (q) => q.or("name.ilike.%conserva%,name.ilike.%pickle%,name.ilike.%azeitona%"),
  },
  chocolates: {
    label: "Chocolates",
    apply: (q) => q.or("name.ilike.%chocolate%,name.ilike.%cacau%,name.ilike.%cocoa%"),
  },
  queijos: { label: "Queijos", apply: (q) => q.or("name.ilike.%queijo%,name.ilike.%cheese%") },
};

export type CollectionProduct = Product & {
  wine_type?: string | null;
  country?: string | null;
};

export async function fetchCollectionProducts(
  slug: string,
  sort: CollectionSort = "best_seller",
  client: typeof supabase = supabase,
): Promise<CollectionProduct[]> {
  const country = getCountry(slug);
  const priceRange = PRICE_RANGES[slug];
  const vFilter = VIRTUAL_FILTERS[slug];
  const isVirtual = !!priceRange || !!vFilter;

  let q = createCollectionProductQuery(client);
  if (country) {
    const values = countryDbValuesForLabel(country.label);
    q = values.length === 1 ? q.eq("country", values[0]) : q.in("country", values);
  } else if (isVirtual) {
    if (priceRange?.min != null) q = q.gte("price", priceRange.min);
    if (priceRange?.max != null) q = q.lte("price", priceRange.max);
    if (vFilter) q = vFilter.apply(q);
  } else {
    q = client
      .from("products")
      .select(
        COLLECTION_PRODUCT_COLUMNS +
          ", product_categories!inner(category_id, categories!inner(slug))",
      )
      .eq("is_active", true)
      .eq("product_categories.categories.slug", slug);
  }

  if (sort === "price_asc") q = q.order("price", { ascending: true });
  else if (sort === "price_desc") q = q.order("price", { ascending: false });
  else if (sort === "name") q = q.order("name");
  else if (sort === "best_seller") q = q.order("best_seller", { ascending: false });
  else q = q.order("created_at", { ascending: false });

  q = q.limit(200);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as CollectionProduct[];
}

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"] & {
  parent: Pick<Database["public"]["Tables"]["categories"]["Row"], "slug" | "name"> | null;
};

export async function fetchCategoryBySlug(
  slug: string,
  client: typeof supabase = supabase,
): Promise<CategoryRow | null> {
  const { data, error } = await client
    .from("categories")
    .select("*, parent:parent_id ( slug, name )")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as CategoryRow | null;
}
