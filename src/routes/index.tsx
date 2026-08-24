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
import { countries } from "@/lib/countries";
import { flagImgUrl } from "@/lib/country-flags";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";
import { HeroBanner, HomeHeroBanner } from "@/components/store/HeroBanner";

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
import { canonicalCountryLabel } from "@/lib/country-aliases";
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

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["banners-home"],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("banners")
          .select("*")
          .eq("is_active", true)
          .in("position", [...HOME_BANNER_POSITIONS])
          .order("sort_order");
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });
  },
  head: () => {
    const seo = pageMeta({
      title: SEO.homeTitle,
      description: SEO.homeDescription,
      path: "/",
    });
    return seo;
  },
  component: Home,
});

function useCategoryTiles() {
  return useQuery({
    queryKey: ["home-category-tiles", HOME_CATEGORY_SLUGS],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select(
          "slug, name, banner_image, product_categories(product_id, products!inner(is_active))",
        )
        .in("slug", [...HOME_CATEGORY_SLUGS])
        .eq("is_active", true)
        .eq("product_categories.products.is_active", true);
      if (error) throw error;
      const order = new Map(HOME_CATEGORY_SLUGS.map((slug, i) => [slug, i]));
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
        .filter(Boolean) as { slug: string; label: string; img: string }[];
    },
    staleTime: 10 * 60_000,
  });
}

function useProducts(filter?: {
  featured?: boolean;
  bestSeller?: boolean;
  categorySlug?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["products", filter],
    queryFn: async () => {
      const baseCols =
        "id, name, slug, price, compare_at_price, image_url, country, grape, rating, category_id, featured, best_seller";
      let q = filter?.categorySlug
        ? supabase
            .from("products")
            .select(baseCols + ", product_categories!inner(category_id, categories!inner(slug))")
            .eq("is_active", true)
            .eq("product_categories.categories.slug", filter.categorySlug)
        : supabase.from("products").select(baseCols).eq("is_active", true);
      if (filter?.featured) q = q.eq("featured", true);
      if (filter?.bestSeller) q = q.eq("best_seller", true);
      q = q.limit(filter?.limit ?? 8);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
}

type HomeBanner = {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  position: string;
  sort_order: number;
};

function useHomeBanners() {
  return useQuery({
    queryKey: ["banners-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .eq("is_active", true)
        .in("position", [...HOME_BANNER_POSITIONS])
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as HomeBanner[];
    },
    staleTime: 5 * 60_000,
  });
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
      <CarouselContent>
        {items.map((item) => (
          <CarouselItem
            key={item.slug}
            className="basis-1/2 sm:basis-1/3 md:basis-1/5 lg:basis-1/7"
          >
            <Link
              to="/colecao/$slug"
              params={{ slug: item.slug }}
              className="group flex flex-col items-center gap-3 text-center"
            >
              <span
                className={
                  compact
                    ? "relative aspect-square w-full max-w-[4.5rem] overflow-hidden rounded-full bg-cream ring-1 ring-border/60 transition-colors group-hover:ring-primary sm:max-w-28 md:max-w-36"
                    : "relative aspect-square w-full max-w-36 overflow-hidden rounded-full bg-cream ring-1 ring-border/60 transition-colors group-hover:ring-primary"
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
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
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
  return (
    <section className="border-y border-border/60 bg-cream/40 py-10 lg:py-12">
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
          <div>
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
              Categorias
            </h3>
            <DiscoveryCarousel items={categoryItems} ariaLabel="Categorias de produtos" />
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-5">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Escolha por preço
          </span>
          {[
            { slug: "ate-100", label: "Até R$ 100" },
            { slug: "100-200", label: "R$ 100 a R$ 200" },
            { slug: "200-300", label: "R$ 200 a R$ 300" },
            { slug: "acima-300", label: "Acima de R$ 300" },
          ].map((range) => (
            <Link
              key={range.slug}
              to="/colecao/$slug"
              params={{ slug: range.slug }}
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
  visibleCountries,
}: {
  visibleCountries: (typeof countries)[number][];
}) {
  if (visibleCountries.length === 0) return null;

  const countryItems = visibleCountries.map((country) => ({
    slug: country.slug,
    label: country.label,
    image: flagImgUrl(country.cc, 160),
  }));

  return (
    <section className="border-y border-border/60 bg-cream/40 py-10 lg:py-12">
      <StoreContainer>
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Explore por origem
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[color:var(--section-title)] md:text-3xl">
            Compre por país
          </h2>
        </div>
        <DiscoveryCarousel items={countryItems} ariaLabel="Países de origem" compact />
      </StoreContainer>
    </section>
  );
}

function useActiveCountries() {
  return useQuery({
    queryKey: ["active-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("country")
        .eq("is_active", true)
        .not("country", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { country: string | null }[]) {
        if (!r.country) continue;
        set.add(canonicalCountryLabel(r.country));
      }
      return set;
    },
    staleTime: 5 * 60_000,
  });
}

function Home() {
  const banners = useHomeBanners();
  const bestSellers = useProducts({ bestSeller: true, limit: 8 });
  const tintos = useProducts({ categorySlug: "tintos", limit: 4 });
  const brancos = useProducts({ categorySlug: "brancos", limit: 4 });
  const espumantes = useProducts({ categorySlug: "so-espumantes", limit: 4 });
  const kits = useProducts({ categorySlug: "combos", limit: 4 });
  const activeCountries = useActiveCountries();
  const categoryTiles = useCategoryTiles();
  const visibleCountries = activeCountries.data
    ? countries.filter((c) => activeCountries.data!.has(c.label))
    : [];

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

      {bestSellers.isLoading ? (
        <ShowcaseSkeleton title="Mais Vendidos" subtitle="Os preferidos dos nossos clientes" />
      ) : bestSellers.data && bestSellers.data.length > 0 ? (
        <ProductCarouselSection
          title="Mais Vendidos"
          subtitle="Os preferidos dos nossos clientes"
          products={bestSellers.data}
        />
      ) : null}

      {categoryTiles.isLoading && (
        <section className="border-y border-border/60 bg-cream/40 py-10 lg:py-12" aria-busy>
          <StoreContainer>
            <div className="h-8 w-72 animate-pulse rounded bg-muted" />
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="aspect-square w-full max-w-36 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </StoreContainer>
        </section>
      )}
      {!categoryTiles.isLoading && <DiscoverySection categories={categoryTiles.data ?? []} />}

      {tintos.isLoading ? (
        <ShowcaseSkeleton title="Tintos" subtitle="Encorpados, elegantes, marcantes" />
      ) : tintos.data && tintos.data.length > 0 ? (
        <ProductCarouselSection
          title="Tintos"
          subtitle="Encorpados, elegantes, marcantes"
          collectionSlug="tintos"
          products={tintos.data}
        />
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

      {brancos.isLoading ? (
        <ShowcaseSkeleton title="Brancos" subtitle="Frescor, mineralidade e elegância" />
      ) : brancos.data && brancos.data.length > 0 ? (
        <ProductCarouselSection
          title="Brancos"
          subtitle="Frescor, mineralidade e elegância"
          collectionSlug="brancos"
          products={brancos.data}
        />
      ) : null}

      {espumantes.isLoading ? (
        <ShowcaseSkeleton title="Espumantes" subtitle="Espumantes selecionados" />
      ) : espumantes.data && espumantes.data.length > 0 ? (
        <ProductCarouselSection
          title="Espumantes"
          subtitle="Espumantes selecionados"
          collectionSlug="so-espumantes"
          products={espumantes.data}
        />
      ) : null}

      {activeCountries.isLoading ? (
        <section className="border-y border-border/60 bg-cream/40 py-10 lg:py-12" aria-busy>
          <StoreContainer>
            <div className="h-8 w-56 animate-pulse rounded bg-muted" />
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="aspect-square w-full max-w-[4.5rem] animate-pulse rounded-full bg-muted sm:max-w-28 md:max-w-36" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </StoreContainer>
        </section>
      ) : (
        <CountryDiscoverySection visibleCountries={visibleCountries} />
      )}

      {kits.isLoading ? (
        <ShowcaseSkeleton title="Kits & Combos" subtitle="Presentes especiais selecionados" />
      ) : kits.data && kits.data.length > 0 ? (
        <ProductCarouselSection
          title="Kits & Combos"
          subtitle="Presentes especiais selecionados"
          collectionSlug="combos"
          products={kits.data}
        />
      ) : null}

      {/* Google Merchant / SEO structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            ...(bestSellers.data && bestSellers.data.length > 0
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    name: `Mais vendidos — ${STORE.name}`,
                    itemListElement: bestSellers.data.map((p, i) => {
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
