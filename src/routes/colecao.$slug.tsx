import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/store/ProductCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { getCountry } from "@/lib/countries";
import { STORE } from "@/lib/settings";
import { absoluteSiteUrl } from "@/lib/site-url";
import { pageMeta } from "@/lib/seo";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toSiteImageUrl } from "@/lib/image-url";
import { StoreContainer } from "@/components/store/StoreContainer";
import { BenefitsBar } from "@/components/store/BenefitsBar";
import {
  fetchCategoryBySlug,
  fetchCollectionProducts,
  PRICE_RANGES,
  VIRTUAL_FILTERS,
  type CollectionSort,
} from "@/lib/collection-products";

const PER_PAGE = 12;
const searchSchema = z.object({
  page: fallback(z.number().int().min(1), 1).default(1),
});

export const Route = createFileRoute("/colecao/$slug")({
  loader: async ({ params, context }) => {
    const sort: CollectionSort = "best_seller";
    const [products, category] = await Promise.all([
      fetchCollectionProducts(params.slug, sort),
      fetchCategoryBySlug(params.slug),
    ]);
    context.queryClient.setQueryData(["cat-products", params.slug, sort], products);
    context.queryClient.setQueryData(["cat", params.slug], category);
    return { products, category, sort };
  },
  component: Collection,
  validateSearch: zodValidator(searchSchema),
  head: ({ params, loaderData }) => {
    const urlPath = `/colecao/${params.slug}`;
    const label = params.slug.replace(/-/g, " ");
    const pretty = label.charAt(0).toUpperCase() + label.slice(1);
    const title = `${pretty} — ${STORE.name}`;
    const description = `Explore a seleção de ${label} da ${STORE.name}. Vinhos e espumantes com frete para todo o Brasil.`;
    const empty = (loaderData?.products?.length ?? 0) === 0;
    const seo = pageMeta({ title, description, path: urlPath, noindex: empty });
    if (empty) return seo;
    return {
      ...seo,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: absoluteSiteUrl("/") },
              { "@type": "ListItem", position: 2, name: pretty, item: absoluteSiteUrl(urlPath) },
            ],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url: absoluteSiteUrl(urlPath),
            isPartOf: {
              "@type": "WebSite",
              name: STORE.name,
              url: absoluteSiteUrl("/"),
            },
          }),
        },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Coleção não encontrada</div>,
});

type Sort = CollectionSort;

function cacheBustedImage(url: string, version?: string | null) {
  const normalized = toSiteImageUrl(url);
  if (!version) return normalized;
  return `${normalized}${normalized.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function Collection() {
  const { slug } = Route.useParams();
  const { page } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/colecao/$slug" });
  const country = getCountry(slug);
  const priceRange = PRICE_RANGES[slug];
  const vFilter = VIRTUAL_FILTERS[slug];
  const isVirtual = !!priceRange || !!vFilter;
  const gridTopRef = useRef<HTMLDivElement>(null);

  const [sort, setSort] = useState<Sort>("best_seller");
  const [priceMin, setPriceMin] = useState<number>(priceRange?.min ?? 0);
  const [priceMax, setPriceMax] = useState<number>(priceRange?.max ?? 5000);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

  const goToPage = (p: number) => {
    navigate({ params: { slug }, search: { page: p } });
    requestAnimationFrame(() => {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      gridTopRef.current?.scrollIntoView({ behavior, block: "start" });
    });
  };

  const cat = useQuery({
    queryKey: ["cat", slug],
    enabled: !isVirtual,
    queryFn: () => fetchCategoryBySlug(slug),
    initialData: loaderData.category ?? undefined,
  });

  const products = useQuery({
    queryKey: ["cat-products", slug, sort],
    queryFn: () => fetchCollectionProducts(slug, sort),
    initialData: sort === loaderData.sort ? loaderData.products : undefined,
  });

  // Filter facets from results
  const facets = useMemo(() => {
    const types = new Map<string, number>();
    const countries = new Map<string, number>();
    (products.data ?? []).forEach((p) => {
      if (p.wine_type) types.set(p.wine_type, (types.get(p.wine_type) ?? 0) + 1);
      if (p.country) countries.set(p.country, (countries.get(p.country) ?? 0) + 1);
    });
    return {
      types: Array.from(types.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      countries: Array.from(countries.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [products.data]);

  const filtered = useMemo(() => {
    return (products.data ?? []).filter((p) => {
      if (p.price < priceMin || p.price > priceMax) return false;
      if (selectedTypes.length && (!p.wine_type || !selectedTypes.includes(p.wine_type)))
        return false;
      if (selectedCountries.length && (!p.country || !selectedCountries.includes(p.country)))
        return false;
      return true;
    });
  }, [products.data, priceMin, priceMax, selectedTypes, selectedCountries]);

  const activeFilterCount =
    (priceMin > 0 || priceMax < 5000 ? 1 : 0) + selectedTypes.length + selectedCountries.length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE),
    [filtered, currentPage],
  );

  // Reset to page 1 when filters/sort change and current page is out of range
  useEffect(() => {
    if (page > totalPages) navigate({ params: { slug }, search: { page: 1 }, replace: true });
  }, [totalPages, page, navigate, slug]);

  const clearFilters = () => {
    setPriceMin(priceRange?.min ?? 0);
    setPriceMax(priceRange?.max ?? 5000);
    setSelectedTypes([]);
    setSelectedCountries([]);
    navigate({ params: { slug }, search: { page: 1 }, replace: true });
  };

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const virtualLabel = priceRange?.label ?? vFilter?.label;
  const heading = country?.label ?? virtualLabel ?? cat.data?.name ?? slug;
  const adminBanner =
    typeof cat.data?.banner_image === "string" ? cat.data.banner_image.trim() : "";

  return (
    <div>
      <BenefitsBar />
      {/* Category banner: only the Admin-configured category banner is allowed here. */}
      {adminBanner && (
        <StoreContainer as="section" className="pt-4">
          <div className="relative w-full overflow-hidden rounded-md bg-muted">
            <img
              src={cacheBustedImage(adminBanner, cat.data?.updated_at)}
              alt={cat.data?.name ?? ""}
              className="block h-auto w-full object-contain lg:h-72 lg:object-cover lg:object-center"
              loading="eager"
            />
          </div>
        </StoreContainer>
      )}

      {/* Collection header */}
      <StoreContainer className="pt-8">
        {!country && (
          <nav className="mb-4 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary">
              Início
            </Link>
            {cat.data?.parent && (
              <>
                {" / "}
                <Link
                  to="/colecao/$slug"
                  params={{ slug: cat.data.parent.slug }}
                  className="hover:text-primary"
                >
                  {cat.data.parent.name}
                </Link>
              </>
            )}
            {" / "}
            <span className="text-foreground">{heading}</span>
          </nav>
        )}

        <div className="mb-6 border-b border-border pb-6">
          <h1 className="font-serif text-4xl font-bold text-[color:var(--product-name)] md:text-5xl">
            {heading}
          </h1>
          {cat.data?.description && (
            <p className="mt-2 text-sm text-muted-foreground">{cat.data.description}</p>
          )}
        </div>
      </StoreContainer>

      {/* MAIN: Sidebar + Grid */}
      <StoreContainer className="pb-12">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* SIDEBAR */}
          <aside className="space-y-6">
            {/* Active filters */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
                  Filtros Selecionados
                </h3>
                <span className="grid h-6 min-w-6 place-items-center rounded-sm bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              </div>
              <button
                onClick={clearFilters}
                className="flex w-full items-center justify-center gap-2 rounded-sm border border-primary bg-background px-3 py-2 text-xs font-semibold uppercase text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover filtros
              </button>
            </div>

            {/* Price */}
            <FilterSection label="Busque por preço" defaultOpen>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-sm border border-border bg-background px-2 py-1.5 text-xs">
                  <span className="mr-1 text-muted-foreground">R$</span>
                  <input
                    type="number"
                    min={0}
                    value={priceMin}
                    onChange={(e) => setPriceMin(Number(e.target.value) || 0)}
                    className="w-full bg-transparent text-right outline-none"
                  />
                </div>
                <div className="flex flex-1 items-center rounded-sm border border-border bg-background px-2 py-1.5 text-xs">
                  <span className="mr-1 text-muted-foreground">R$</span>
                  <input
                    type="number"
                    min={0}
                    value={priceMax}
                    onChange={(e) => setPriceMax(Number(e.target.value) || 0)}
                    className="w-full bg-transparent text-right outline-none"
                  />
                </div>
                <button
                  type="button"
                  className="rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase text-primary-foreground"
                >
                  OK
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={priceMax}
                onChange={(e) => setPriceMax(Number(e.target.value))}
                className="mt-3 w-full accent-[var(--primary)]"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>R$ {priceMin}</span>
                <span>R$ {priceMax}</span>
              </div>
            </FilterSection>

            {/* Wine types */}
            {facets.types.length > 0 && (
              <FilterSection label="Tipo de Vinho" defaultOpen>
                <ul className="space-y-1.5">
                  {facets.types.map(([type, n]) => (
                    <li key={type}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(type)}
                          onChange={() => toggle(selectedTypes, setSelectedTypes, type)}
                          className="h-3.5 w-3.5 rounded-sm border-border accent-[var(--primary)]"
                        />
                        <span className="flex-1 capitalize">{type}</span>
                        <span className="text-muted-foreground">({n})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            )}

            {/* Countries (only on non-country pages) */}
            {!country && facets.countries.length > 0 && (
              <FilterSection label="País">
                <ul className="space-y-1.5">
                  {facets.countries.map(([c, n]) => (
                    <li key={c}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedCountries.includes(c)}
                          onChange={() => toggle(selectedCountries, setSelectedCountries, c)}
                          className="h-3.5 w-3.5 rounded-sm border-border accent-[var(--primary)]"
                        />
                        <span className="flex-1">{c}</span>
                        <span className="text-muted-foreground">({n})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </FilterSection>
            )}
          </aside>

          {/* PRODUCT GRID */}
          <div ref={gridTopRef} className="scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="text-sm text-muted-foreground">
                {filtered.length} produtos encontrados para essa busca
              </div>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as Sort);
                  navigate({ params: { slug }, search: { page: 1 }, replace: true });
                }}
                className="rounded-sm border border-border bg-card px-3 py-2 text-sm"
              >
                <option value="best_seller">Mais Vendidos</option>
                <option value="recent">Mais recentes</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="name">Nome (A-Z)</option>
              </select>
            </div>

            {products.isLoading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[3/5] animate-pulse rounded-sm bg-muted" />
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {paginated.map((p) => (
                    <ProductCard key={p.id} p={p} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <CollectionPagination
                    current={currentPage}
                    total={totalPages}
                    onChange={goToPage}
                  />
                )}
              </>
            ) : (
              <div className="py-16 text-center text-muted-foreground">
                Nenhum produto disponível com esses filtros.
              </div>
            )}
          </div>
        </div>
      </StoreContainer>
    </div>
  );
}

function FilterSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-foreground"
      >
        {label}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function CollectionPagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    const set = new Set<number>([1, total, current, current - 1, current + 1]);
    return Array.from(set)
      .filter((n) => n >= 1 && n <= total)
      .sort((a, b) => a - b);
  }, [current, total]);

  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40";
  const active =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-sm border border-primary bg-primary px-3 text-sm font-bold text-primary-foreground";

  return (
    <nav
      aria-label="Paginação de produtos"
      className="mt-8 flex flex-wrap items-center justify-center gap-2"
    >
      <button
        type="button"
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className={btn}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">Anterior</span>
      </button>
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev != null && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-2">
            {gap && <span className="px-1 text-muted-foreground">…</span>}
            <button
              type="button"
              onClick={() => onChange(p)}
              className={p === current ? active : btn}
              aria-current={p === current ? "page" : undefined}
              aria-label={`Página ${p}`}
            >
              {p}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className={btn}
        aria-label="Próxima página"
      >
        <span className="mr-1 hidden sm:inline">Próxima</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
