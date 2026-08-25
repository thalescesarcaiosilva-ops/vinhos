import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ccForCountry, flagImgUrl } from "@/lib/country-flags";

export type StoreCategory = {
  id: string;
  slug: string;
  name: string;
  kind: string | null;
  sort_order: number | null;
  banner_image: string | null;
  parent_id: string | null;
};

/** Categorias ativas que têm ≥1 produto ativo (via product_categories). */
export async function fetchStoreCategoriesWithProducts(): Promise<StoreCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, slug, name, kind, sort_order, banner_image, parent_id, product_categories!inner(product_id, products!inner(is_active))",
    )
    .eq("is_active", true)
    .eq("product_categories.products.is_active", true);
  if (error) throw error;

  const byId = new Map<string, StoreCategory>();
  for (const row of data ?? []) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        kind: row.kind ?? null,
        sort_order: row.sort_order,
        banner_image: row.banner_image,
        parent_id: row.parent_id,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name),
  );
}

export function useStoreCategories() {
  return useQuery({
    queryKey: ["store-categories-with-products"],
    queryFn: fetchStoreCategoriesWithProducts,
    staleTime: 5 * 60_000,
  });
}

export function categoriesByKind(cats: StoreCategory[], kind: string): StoreCategory[] {
  return cats.filter((c) => c.kind === kind);
}

export function countryFlagForCategory(cat: StoreCategory, size: 40 | 80 | 160 = 80): string | null {
  const cc = ccForCountry(cat.slug) ?? ccForCountry(cat.name);
  return cc ? flagImgUrl(cc, size) : null;
}

/** Faixas de preço = filtros em /colecao/todos (não são coleções). */
export const PRICE_FILTERS = [
  { min: 0, max: 100, label: "Até R$ 100", legacySlug: "ate-100" },
  { min: 100, max: 200, label: "R$ 100 a R$ 200", legacySlug: "100-200" },
  { min: 200, max: 300, label: "R$ 200 a R$ 300", legacySlug: "200-300" },
  { min: 300, max: undefined, label: "Acima de R$ 300", legacySlug: "acima-300" },
] as const;

export function priceFilterToSearch(min: number, max?: number): { min?: number; max?: number } {
  return {
    ...(min > 0 ? { min } : {}),
    ...(max != null ? { max } : {}),
  };
}

export type MenuLink = {
  slug: string;
  label: string;
  search?: { min?: number; max?: number };
};

export type MenuGroup = { label: string; items: MenuLink[] };

const TYPE_MENU: { label: string; slugs: string[]; labels?: Record<string, string> }[] = [
  {
    label: "Vinhos",
    slugs: ["so-vinhos", "tintos", "brancos", "roses", "vinhos-zero-alcool"],
    labels: { "so-vinhos": "Todos os Vinhos" },
  },
  {
    label: "Espumantes",
    slugs: ["so-espumantes", "espumantes-brancos", "espumantes-roses", "espumantes-zero-alcool"],
    labels: { "so-espumantes": "Todos os Espumantes" },
  },
];

const COMBO_MENU: { label: string; slugs: string[] }[] = [
  {
    label: "Só Vinhos",
    slugs: [
      "combos-vinhos-tintos",
      "combos-vinhos-brancos",
      "combos-vinhos-roses",
      "combos-vinhos-tintos-roses",
      "combos-vinhos-brancos-roses",
      "combos-vinhos-zero-alcool",
    ],
  },
  {
    label: "Só Espumantes",
    slugs: [
      "combos-espumantes-brancos",
      "combos-espumantes-roses",
      "combos-espumantes-brancos-roses",
      "combos-espumantes-zero-alcool",
    ],
  },
];

function linksFromSlugs(
  cats: StoreCategory[],
  slugs: string[],
  labels?: Record<string, string>,
): MenuLink[] {
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  return slugs
    .map((slug) => {
      const cat = bySlug.get(slug);
      if (!cat) return null;
      return { slug, label: labels?.[slug] ?? cat.name };
    })
    .filter(Boolean) as MenuLink[];
}

export function buildTypeMenuGroups(cats: StoreCategory[]): MenuGroup[] {
  const types = cats.filter((c) => c.kind === "type");
  return TYPE_MENU.map((g) => ({
    label: g.label,
    items: linksFromSlugs(types, g.slugs, g.labels),
  })).filter((g) => g.items.length > 0);
}

export function buildComboMenuGroups(cats: StoreCategory[]): MenuGroup[] {
  const combos = cats.filter((c) => c.kind === "combo");
  return COMBO_MENU.map((g) => ({
    label: g.label,
    items: linksFromSlugs(combos, g.slugs),
  })).filter((g) => g.items.length > 0);
}

export function buildPriceMenuGroups(): MenuGroup[] {
  return [
    {
      label: "Por faixa de preço",
      items: PRICE_FILTERS.map((f) => ({
        slug: "todos",
        label: f.label,
        search: priceFilterToSearch(f.min, f.max),
      })),
    },
  ];
}

export function countryMenuItems(cats: StoreCategory[]): Array<StoreCategory & { cc: string }> {
  return cats
    .filter((c) => c.kind === "country")
    .map((c) => {
      const cc = ccForCountry(c.slug) ?? ccForCountry(c.name);
      return cc ? { ...c, cc } : null;
    })
    .filter(Boolean) as Array<StoreCategory & { cc: string }>;
}
