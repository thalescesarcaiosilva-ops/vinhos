import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/components/store/ProductCard";
import { ProductCarouselSection } from "@/components/store/ProductCarouselSection";
import { StoreContainer } from "@/components/store/StoreContainer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { BenefitsBar } from "@/components/store/BenefitsBar";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";
import { HeroBanner, HomeHeroBanner, homeHeroLcpPreloadHref } from "@/components/store/HeroBanner";

const HOME_BANNER_POSITIONS = [
  "home_hero",
  "home_hero_desktop",
  "home_hero_mobile",
  "home_strip",
] as const;
import { absoluteSiteUrl, toAbsoluteImageUrl } from "@/lib/site-url";
import { pageMeta, SEO } from "@/lib/seo";
import { STORE } from "@/lib/settings";
import { resolveProductBrandName } from "@/lib/product-seo";
import {
  countryFlagForCategory,
  fetchStoreCategoriesWithProducts,
  PRICE_FILTERS,
  priceFilterToSearch,
  useStoreCategories,
  type StoreCategory,
} from "@/lib/store-collections";
import catTintos from "@/assets/cat-tintos.webp";
import catBrancos from "@/assets/cat-brancos.webp";
import catRoses from "@/assets/cat-roses.webp";
import catEspumantes from "@/assets/cat-espumantes.webp";
import catKits from "@/assets/cat-kits.webp";
import catSemAlcool from "@/assets/cat-semalcool.webp";

const LOCAL_CATEGORY_IMAGES: Record<string, string> = {
  "so-vinhos": catTintos,
  tintos: catTintos,
  brancos: catBrancos,
  roses: catRoses,
  "so-espumantes": catEspumantes,
  combos: catKits,
  "vinhos-zero-alcool": catSemAlcool,
};

const HOME_CATEGORY_SLUGS = [
  "so-vinhos",
  "tintos",
  "brancos",
  "roses",
  "so-espumantes",
  "combos",
  "vinhos-zero-alcool",
] as const;

type HomeBanner = {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  position: string;
  sort_order: number;
};

type CategoryTile = { slug: string; label: string; img: string };

async function fetchHomeBanners(): Promise<HomeBanner[]> {
  const { data, error } = await supabase
    .from("banners")
    .select("*")
    .eq("is_active", true)
    .in("position", [...HOME_BANNER_POSITIONS])
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as HomeBanner[];
}

async function fetchCategoryTiles(): Promise<CategoryTile[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "slug, name, banner_image, product_categories(product_id, products!inner(is_active))",
    )
    .in("slug", [...HOME_CATEGORY_SLUGS])
    .eq("is_active", true)
    .eq("product_categories.products.is_active", true);
  if (error) throw error;
  const order = new Map<string, number>(HOME_CATEGORY_SLUGS.map((slug, i) => [slug, i]));
  return (data ?? [])
    .filter((category) => (category.product_categories?.length ?? 0) > 0)
    .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99))
    .map((category) => {
      const img = category.banner_image
        ? toTransformedImageUrl(category.banner_image, {
            width: 180,
            quality: 70,
            format: "webp",
          })
        : LOCAL_CATEGORY_IMAGES[category.slug];
      if (!img) return null;
      return { slug: category.slug, label: category.name, img };
    })
    .filter(Boolean) as CategoryTile[];
}

async function fetchHomeProducts(filter?: {
  bestSeller?: boolean;
  categorySlug?: string;
  limit?: number;
}): Promise<Product[]> {
  const baseCols =
    "id, name, slug, price, compare_at_price, image_url, country, grape, rating, category_id, featured, best_seller";
  let q = filter?.categorySlug
    ? supabase
        .from("products")
        .select(baseCols + ", product_categories!inner(category_id, categories!inner(slug))")
        .eq("is_active", true)
        .eq("product_categories.categories.slug", filter.categorySlug)
    : supabase.from("products").select(baseCols).eq("is_active", true);
  if (filter?.bestSeller) q = q.eq("best_seller", true);
  q = q.limit(filter?.limit ?? 8);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Product[];
}

function pickBanner(banners: HomeBanner[], position: string) {
  return banners.find((banner) => banner.position === position) ?? null;
}

function resolveHomeHero(banners: HomeBanner[]) {
  const legacy = pickBanner(banners, "home_hero");
  const desktop = pickBanner(banners, "home_hero_desktop") ?? legacy;
  const mobile = pickBanner(banners, "home_hero_mobile") ?? desktop ?? legacy;
  return { desktop, mobile };
}

function countryTilesFromStore(cats: StoreCategory[]) {
  return cats
    .filter((c) => c.kind === "country")
    .map((c) => {
      const image = countryFlagForCategory(c, 160);
      return image ? { slug: c.slug, label: c.name, image } : null;
    })
    .filter(Boolean) as { slug: string; label: string; image: string }[];
}

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const [banners, categoryTiles, storeCategories, bestSellers] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["banners-home"],
        queryFn: fetchHomeBanners,
        staleTime: 5 * 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["home-category-tiles", HOME_CATEGORY_SLUGS],
        queryFn: fetchCategoryTiles,
        staleTime: 10 * 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["store-categories-with-products"],
        queryFn: fetchStoreCategoriesWithProducts,
        staleTime: 5 * 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { bestSeller: true, limit: 8 }],
        queryFn: () => fetchHomeProducts({ bestSeller: true, limit: 8 }),
        staleTime: 60_000,
      }),
    ]);
    // Prefetch seções abaixo (HTML com produtos reais para o bot; não bloqueia se falhar parcial)
    const [tintos, brancos, espumantes, kits] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["products", { categorySlug: "tintos", limit: 4 }],
        queryFn: () => fetchHomeProducts({ categorySlug: "tintos", limit: 4 }),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { categorySlug: "brancos", limit: 4 }],
        queryFn: () => fetchHomeProducts({ categorySlug: "brancos", limit: 4 }),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { categorySlug: "so-espumantes", limit: 4 }],
        queryFn: () => fetchHomeProducts({ categorySlug: "so-espumantes", limit: 4 }),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { categorySlug: "combos", limit: 4 }],
        queryFn: () => fetchHomeProducts({ categorySlug: "combos", limit: 4 }),
        staleTime: 60_000,
      }),
    ]);
    return {
      banners,
      categoryTiles,
      storeCategories,
      bestSellers,
      tintos,
      brancos,
      espumantes,
      kits,
    };
  },
  head: ({ loaderData }) => {
    const seo = pageMeta({
      title: SEO.homeTitle,
      description: SEO.homeDescription,
      path: "/",
    });
    const { desktop, mobile } = resolveHomeHero(loaderData?.banners ?? []);
    const lcpHref = homeHeroLcpPreloadHref(mobile?.image_url, desktop?.image_url);
    const seoLinks = Array.isArray(seo.links) ? seo.links : [];
    return {
      ...seo,
      links: [
        ...seoLinks,
        ...(lcpHref
          ? [{ rel: "preload" as const, as: "image" as const, href: lcpHref, type: "image/webp" }]
          : []),
      ],
    };
  },
  component: Home,
});

function useCategoryTiles(initialData?: CategoryTile[]) {
  return useQuery({
    queryKey: ["home-category-tiles", HOME_CATEGORY_SLUGS],
    queryFn: fetchCategoryTiles,
    initialData,
    staleTime: 10 * 60_000,
  });
}

function useProducts(
  filter?: {
    featured?: boolean;
    bestSeller?: boolean;
    categorySlug?: string;
    limit?: number;
  },
  initialData?: Product[],
) {
  return useQuery({
    queryKey: ["products", filter],
    queryFn: (): Promise<Product[]> => fetchHomeProducts(filter),
    initialData,
    staleTime: 60_000,
  });
}

function useHomeBanners(initialData?: HomeBanner[]) {
  return useQuery({
    queryKey: ["banners-home"],
    queryFn: fetchHomeBanners,
    initialData,
    staleTime: 5 * 60_000,
  });
}

function ShowcaseSkeleton({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="py-10 lg:py-12" aria-busy>
      <StoreContainer>
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-bold text-[color:var(--section-title)] md:text-3xl lg:text-4xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4 overflow-hidden md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`${i > 1 ? "hidden md:block" : ""} ${i > 2 ? "md:hidden lg:block" : ""} overflow-hidden rounded-sm border border-border/60 bg-card`}
            >
              <div className="aspect-[3/4] animate-pulse bg-muted" />
              <div className="space-y-2 p-3 sm:p-4">
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
                <div className="h-6 w-2/5 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </StoreContainer>
    </section>
  );
}

type DiscoveryTile = {
  slug: string;
  label: string;
  image: string;
  imageClassName?: string;
};

function DiscoveryCarousel({
  items,
  ariaLabel,
  compact,
}: {
  items: DiscoveryTile[];
  ariaLabel: string;
  /** Bandeiras / tiles menores no mobile (ex.: países). */
  compact?: boolean;
}) {
  return (
    <Carousel opts={{ align: "start", loop: items.length > 6 }} aria-label={ariaLabel}>
      <CarouselContent className="-ml-2 sm:-ml-4">
        {items.map((item) => (
          <CarouselItem
            key={item.slug}
            className={
              compact
                ? "basis-[28%] pl-2 sm:basis-1/3 sm:pl-4 md:basis-1/5 lg:basis-1/7"
                : "basis-[30%] pl-2 sm:basis-1/3 sm:pl-4 md:basis-1/5 lg:basis-1/7"
            }
          >
            <Link
              to="/colecao/$slug"
              params={{ slug: item.slug }}
              className="group flex flex-col items-center gap-1.5 text-center sm:gap-3"
            >
              <span
                className={
                  compact
                    ? "relative aspect-square w-full max-w-[3.25rem] overflow-hidden rounded-full bg-cream ring-1 ring-border/60 transition-colors group-hover:ring-primary sm:max-w-28 md:max-w-36"
                    : "relative aspect-square w-full max-w-[4rem] overflow-hidden rounded-full bg-cream ring-1 ring-border/60 transition-colors group-hover:ring-primary sm:max-w-28 md:max-w-36"
                }
              >
                <img
                  src={item.image}
                  alt=""
                  width={144}
                  height={144}
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${item.imageClassName ?? ""}`}
                />
              </span>
              <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-foreground sm:text-xs">
                {item.label}
              </span>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2 hidden border-border/60 bg-background/90 shadow-sm md:flex" />
      <CarouselNext className="right-2 hidden border-border/60 bg-background/90 shadow-sm md:flex" />
    </Carousel>
  );
}

function DiscoverySection({
  categories,
}: {
  categories: { slug: string; label: string; img: string }[];
}) {
  const categoryItems = categories.map((category) => ({
    slug: category.slug,
    label: category.label,
    image: category.img,
    imageClassName: "object-contain p-3",
  }));
  // Seção sempre no HTML (títulos + preços + categorias SSR) — bot e CLS.
  return (
    <section className="border-y border-border/60 bg-cream/40 py-6 sm:py-10 lg:py-12">
      <StoreContainer>
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Explore a seleção
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--section-title)] md:text-3xl">
            Descubra seu próximo vinho
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Navegue por estilo, origem ou faixa de preço.
          </p>
        </div>

        {categoryItems.length > 0 && (
          <div className="min-h-[7.5rem] sm:min-h-[9rem]">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground sm:mb-4">
              Categorias
            </h3>
            <DiscoveryCarousel items={categoryItems} ariaLabel="Categorias de produtos" />
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Escolha por preço
          </span>
          {PRICE_FILTERS.map((range) => (
            <Link
              key={range.legacySlug}
              to="/colecao/$slug"
              params={{ slug: "todos" }}
              search={{ page: 1, ...priceFilterToSearch(range.min, range.max) }}
              className="border-b border-primary/40 pb-0.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {range.label}
            </Link>
          ))}
        </div>
      </StoreContainer>
    </section>
  );
}

function CountryDiscoverySection({
  countries,
}: {
  countries: { slug: string; label: string; image: string }[];
}) {
  // Sempre renderiza a seção no HTML quando há países (SSR) — evita CLS e buraco para o bot.
  if (countries.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-cream/40 py-6 sm:py-10 lg:py-12">
      <StoreContainer>
        <div className="mb-3 sm:mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Explore por origem
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--section-title)] md:text-3xl">
            Compre por país
          </h2>
        </div>
        <DiscoveryCarousel items={countries} ariaLabel="Países de origem" compact />
      </StoreContainer>
    </section>
  );
}

function productsOrFallback(
  queryData: Product[] | undefined,
  fallback: Product[],
): Product[] {
  return queryData ?? fallback;
}

function Home() {
  const loaderData = Route.useLoaderData();
  const banners = useHomeBanners(loaderData.banners);
  const bestSellersQ = useProducts(
    { bestSeller: true, limit: 8 },
    loaderData.bestSellers,
  );
  const tintosQ = useProducts({ categorySlug: "tintos", limit: 4 }, loaderData.tintos);
  const brancosQ = useProducts({ categorySlug: "brancos", limit: 4 }, loaderData.brancos);
  const espumantesQ = useProducts(
    { categorySlug: "so-espumantes", limit: 4 },
    loaderData.espumantes,
  );
  const kitsQ = useProducts({ categorySlug: "combos", limit: 4 }, loaderData.kits);
  const categoryTiles = useCategoryTiles(loaderData.categoryTiles);
  const storeCats = useStoreCategories(loaderData.storeCategories);
  const countries = countryTilesFromStore(storeCats.data ?? loaderData.storeCategories);

  // SSR/loader first: Googlebot sees real products in HTML (not empty shells waiting on client).
  const bestSellers = productsOrFallback(bestSellersQ.data, loaderData.bestSellers);
  const tintos = productsOrFallback(tintosQ.data, loaderData.tintos);
  const brancos = productsOrFallback(brancosQ.data, loaderData.brancos);
  const espumantes = productsOrFallback(espumantesQ.data, loaderData.espumantes);
  const kits = productsOrFallback(kitsQ.data, loaderData.kits);

  const { desktop: heroDesktop, mobile: heroMobile } = resolveHomeHero(banners.data ?? []);
  const stripBanner = pickBanner(banners.data ?? [], "home_strip");

  return (
    <div>
      <BenefitsBar />

      <section className="w-full bg-muted">
        <HomeHeroBanner
          desktopSrc={heroDesktop?.image_url}
          mobileSrc={heroMobile?.image_url}
          alt={heroDesktop?.title?.trim() || heroMobile?.title?.trim() || "Banner home"}
          desktopLinkUrl={heroDesktop?.link_url}
          mobileLinkUrl={heroMobile?.link_url}
        />
      </section>

      {bestSellers.length > 0 ? (
        <ProductCarouselSection
          title="Mais Vendidos"
          subtitle="Os preferidos dos nossos clientes"
          products={bestSellers}
        />
      ) : bestSellersQ.isLoading ? (
        <ShowcaseSkeleton title="Mais Vendidos" subtitle="Os preferidos dos nossos clientes" />
      ) : null}

      <DiscoverySection categories={categoryTiles.data ?? loaderData.categoryTiles} />

      {tintos.length > 0 ? (
        <ProductCarouselSection
          title="Tintos"
          subtitle="Encorpados, elegantes, marcantes"
          collectionSlug="tintos"
          products={tintos}
        />
      ) : tintosQ.isLoading ? (
        <ShowcaseSkeleton title="Tintos" subtitle="Encorpados, elegantes, marcantes" />
      ) : null}

      {/* Banner secundário — aspect reservado */}
      {stripBanner?.image_url && (
        <section className="py-10 lg:py-12">
          <StoreContainer>
            <HeroBanner
              src={stripBanner.image_url}
              alt={stripBanner.title?.trim() || "Banner"}
              linkUrl={stripBanner.link_url}
              priority={false}
              aspectClassName="aspect-[1600/386] rounded-sm"
            />
          </StoreContainer>
        </section>
      )}

      {brancos.length > 0 ? (
        <ProductCarouselSection
          title="Brancos"
          subtitle="Frescor, mineralidade e elegância"
          collectionSlug="brancos"
          products={brancos}
        />
      ) : brancosQ.isLoading ? (
        <ShowcaseSkeleton title="Brancos" subtitle="Frescor, mineralidade e elegância" />
      ) : null}

      {espumantes.length > 0 ? (
        <ProductCarouselSection
          title="Espumantes"
          subtitle="Espumantes selecionados"
          collectionSlug="so-espumantes"
          products={espumantes}
        />
      ) : espumantesQ.isLoading ? (
        <ShowcaseSkeleton title="Espumantes" subtitle="Espumantes selecionados" />
      ) : null}

      <CountryDiscoverySection countries={countries} />

      {kits.length > 0 ? (
        <ProductCarouselSection
          title="Kits & Combos"
          subtitle="Presentes especiais selecionados"
          collectionSlug="combos"
          products={kits}
        />
      ) : kitsQ.isLoading ? (
        <ShowcaseSkeleton title="Kits & Combos" subtitle="Presentes especiais selecionados" />
      ) : null}

      {/* Google Merchant / SEO structured data (produtos do loader/SSR) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            ...(bestSellers.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: `Mais vendidos — ${STORE.name}`,
                    itemListElement: bestSellers.map((p, i) => {
                      const brandName = resolveProductBrandName(p.name, null, p.country);
                      return {
                        "@type": "ListItem",
                        position: i + 1,
                        item: {
                          "@type": "Product",
                          name: p.name,
                          image: toAbsoluteImageUrl(toSiteImageUrl(p.image_url)),
                          url: absoluteSiteUrl(`/produto/${p.slug}`),
                          ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
                          offers: {
                            "@type": "Offer",
                            priceCurrency: "BRL",
                            price: Number(p.price).toFixed(2),
                            availability: "https://schema.org/InStock",
                            url: absoluteSiteUrl(`/produto/${p.slug}`),
                            seller: {
                              "@type": "Organization",
                              name: STORE.name,
                            },
                          },
                        },
                      };
                    }),
                  },
                ]
              : []),
          ]),
        }}
      />
    </div>
  );
}
