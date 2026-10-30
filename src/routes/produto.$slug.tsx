import { createFileRoute, Link, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, type ComponentType } from "react";
import { brl } from "@/lib/format";
import { productKeyFacts } from "@/lib/product-facts";
import { buildProductStory, packageLine } from "@/lib/product-story";
import { useCart } from "@/lib/cart";
import { toMerchantImageUrl, toSiteImageUrl } from "@/lib/image-url";
import { ProductImage } from "@/components/store/ProductImage";
import {
  ProductMediaDesktopMain,
  ProductMediaMobileCarousel,
  type ProductMediaItem,
} from "@/components/store/ProductMediaGallery";
import { ProductMobileBuyBar } from "@/components/store/ProductMobileBuyBar";
import {
  ArrowRight,
  Calendar,
  Droplet,
  Home,
  Info,
  Leaf,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Star,
  MapPin,
  CreditCard,
  Globe,
  Wine,
  GlassWater,
  Grape,
  Percent,
  Thermometer,
  Eye,
  Wind,
  Soup,
  Utensils,
} from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFavorites, useToggleFavorite } from "@/lib/favorites";
import { Reviews } from "@/components/store/Reviews";
import { STORE } from "@/lib/settings";
import { absoluteSiteUrl, toAbsoluteImageUrl } from "@/lib/site-url";
import {
  buildProductPlainDescription,
  normalizeGtin,
  productSkuIdentifier,
  truncateAtWord,
  resolveProductBrandName,
} from "@/lib/product-seo";
import { buildSellerOrganization } from "@/lib/seo";
import {
  useStoreSettings,
  installmentPlan,
  DEFAULT_SETTINGS,
  type PaymentSettings,
} from "@/lib/store-settings";
import { flagUrlFor } from "@/lib/country-flags";
import type { Product as CardProduct } from "@/components/store/ProductCard";
import { ProductCarouselSection } from "@/components/store/ProductCarouselSection";
import { StoreContainer } from "@/components/store/StoreContainer";
import { ProductHtmlContent } from "@/components/store/ProductHtmlContent";
import { PixDiscountBanner } from "@/components/store/PixDiscountBanner";
import { BenefitsBar } from "@/components/store/BenefitsBar";
import { ProductShippingCalculator } from "@/components/store/ProductShippingCalculator";
import { ProductTrustCards } from "@/components/store/ProductTrustCards";
import { withRetry } from "@/lib/with-retry";

type VideoInfo = {
  kind: "youtube" | "vimeo" | "file";
  embedUrl: string;
  contentUrl: string;
  thumbnailUrl?: string;
};
function parseVideo(url: string | null | undefined): VideoInfo | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  // YouTube
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  if (yt) {
    const id = yt[1];
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube.com/embed/${id}`,
      contentUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }
  // Vimeo
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    const id = vm[1];
    return {
      kind: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${id}`,
      contentUrl: `https://vimeo.com/${id}`,
    };
  }
  // Arquivo do Storage: caminho do site (/storage/...), nunca o host do Supabase.
  const siteUrl = toSiteImageUrl(u);
  return { kind: "file", embedUrl: siteUrl, contentUrl: siteUrl };
}

async function fetchProductBySlug(slug: string) {
  const data = await withRetry(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
  if (!data) return data;

  // Contagem de reviews é opcional — falha aqui não pode derrubar a PDP (Google Merchant).
  let approved_review_count = 0;
  try {
    const { count, error: reviewsError } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.id)
      .eq("is_approved", true);
    if (!reviewsError) approved_review_count = count ?? 0;
  } catch {
    /* ignore */
  }

  return { ...data, approved_review_count };
}

function legacySlugWithoutSuffix(slug: string): string | null {
  // Slugs antigos do feed/Merchant após limpeza de sufixo "-2".
  if (!slug.endsWith("-2") || slug.length <= 2) return null;
  return slug.slice(0, -2);
}

export const Route = createFileRoute("/produto/$slug")({
  component: ProductPage,
  loader: async ({ params, context }) => {
    let product = await fetchProductBySlug(params.slug);

    // Redirect 301-like: /produto/foo-2 → /produto/foo quando o slug novo existe.
    if (!product) {
      const base = legacySlugWithoutSuffix(params.slug);
      if (base) {
        const alt = await fetchProductBySlug(base);
        if (alt) {
          throw redirect({
            to: "/produto/$slug",
            params: { slug: base },
            replace: true,
          });
        }
      }
    }

    if (!product) throw notFound();
    context.queryClient.setQueryData(["product", params.slug], product);
    return { product };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.product;
    if (!p) {
      return {
        meta: [
          { title: `Produto não encontrado — ${STORE.name}` },
          { name: "robots", content: "noindex" },
          {
            name: "description",
            content: `O produto solicitado não está disponível na ${STORE.name}.`,
          },
        ],
      };
    }
    const url = absoluteSiteUrl(`/produto/${params.slug}`);
    const price = Number(p.price).toFixed(2);
    const schemaDesc = buildProductPlainDescription(p);
    const metaDesc = truncateAtWord(schemaDesc, 160);
    const pageTitle = `${p.name} — ${STORE.name}`;
    const inStock = (p.stock ?? 0) > 0;
    const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const productImages = [p.image_url, ...(Array.isArray(p.gallery) ? p.gallery : [])]
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((u) => toAbsoluteImageUrl(toMerchantImageUrl(u)))
      .filter(Boolean);
    const mainImage = productImages[0];
    const skuId = productSkuIdentifier(p.sku);
    const gtin = normalizeGtin(p.gtin);
    const brandName = resolveProductBrandName(p.name, p.brand, p.country);
    const productSchema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      url,
      image: productImages.length > 0 ? productImages : undefined,
      description: schemaDesc,
      ...(gtin ? { gtin } : {}),
      ...(skuId ? { sku: skuId, mpn: skuId } : {}),
      ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "BRL",
        price,
        priceValidUntil,
        itemCondition: "https://schema.org/NewCondition",
        availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: buildSellerOrganization(),
      },
    };

    const approvedReviewCount = Number(p.approved_review_count ?? 0);
    const ratingValue = Number(p.rating ?? 0);
    if (approvedReviewCount > 0 && ratingValue > 0) {
      productSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: ratingValue.toFixed(1),
        reviewCount: approvedReviewCount,
      };
    }
    const v = parseVideo(p.video_url);
    if (v) {
      productSchema.video = {
        "@type": "VideoObject",
        name: p.name,
        description: schemaDesc,
        thumbnailUrl: [v.thumbnailUrl ? toAbsoluteImageUrl(v.thumbnailUrl) : mainImage].filter(
          Boolean,
        ),
        uploadDate: (p.created_at ? new Date(p.created_at) : new Date()).toISOString(),
        contentUrl: toAbsoluteImageUrl(v.contentUrl) ?? v.contentUrl,
        embedUrl: toAbsoluteImageUrl(v.embedUrl) ?? v.embedUrl,
      };
    }
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: absoluteSiteUrl("/") },
        {
          "@type": "ListItem",
          position: 2,
          name: "Vinhos",
          item: absoluteSiteUrl("/colecao/vinhos"),
        },
        { "@type": "ListItem", position: 3, name: p.name, item: url },
      ],
    };
    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: metaDesc },
        { property: "og:type", content: "product" },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: metaDesc },
        { property: "og:url", content: url },
        { property: "og:site_name", content: STORE.name },
        { property: "og:locale", content: "pt_BR" },
        ...(mainImage ? [{ property: "og:image", content: mainImage }] : []),
        { property: "product:price:amount", content: price },
        { property: "product:price:currency", content: "BRL" },
        { property: "product:availability", content: inStock ? "in stock" : "out of stock" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: pageTitle },
        { name: "twitter:description", content: metaDesc },
        ...(mainImage ? [{ name: "twitter:image", content: mainImage }] : []),
      ],
      links: [
        { rel: "canonical", href: url },
        ...(mainImage ? [{ rel: "preload", as: "image", href: mainImage }] : []),
      ],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(productSchema) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumb) },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Produto não encontrado</div>,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { product: loaderProduct } = Route.useLoaderData();
  const { add, closeDrawer } = useCart();
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [thumbStart, setThumbStart] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const { data: settings, isPending: settingsPending } = useStoreSettings();

  const q = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProductBySlug(slug),
    initialData: loaderProduct,
    staleTime: 60_000,
  });

  const reviewsCountQ = useQuery({
    queryKey: ["reviews-count", q.data?.id],
    enabled: Boolean(q.data?.id),
    queryFn: async () => {
      try {
        const { count, error } = await supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("product_id", q.data!.id)
          .eq("is_approved", true);
        if (error) return 0;
        return count ?? 0;
      } catch {
        return 0;
      }
    },
    initialData: loaderProduct?.approved_review_count ?? 0,
  });

  // Produto pode já vir do loader SSR enquanto store_settings ainda carrega no client.
  // Acessar settings!.payments antes disso quebra a página (comum em IPs no exterior com latência maior).
  if (q.isLoading || (settingsPending && !settings)) {
    return <div className="mx-auto max-w-7xl p-10">Carregando…</div>;
  }
  if (!q.data) return <div className="mx-auto max-w-7xl p-10">Produto não encontrado</div>;

  const p = q.data;
  const price = Number(p.price);
  const compare = p.compare_at_price ? Number(p.compare_at_price) : 0;
  const discount = compare > price ? Math.round(((compare - price) / compare) * 100) : 0;
  const pay = settings?.payments ?? DEFAULT_SETTINGS.payments;
  const showPix = pay.pixEnabled;
  const pixDiscountPct = pay.pixDiscount || 0;
  const hasPixDiscount = showPix && pixDiscountPct > 0;
  const pixPrice = price * (1 - pixDiscountPct / 100);
  const cardPrice = price;
  const plan = installmentPlan(cardPrice, pay);
  const featuredInstallment = plan[plan.length - 1];

  const galleryArr = Array.isArray(p.gallery) ? (p.gallery as string[]) : [];
  const imageList = [p.image_url, ...galleryArr]
    .filter(Boolean)
    .map((u) => toSiteImageUrl(u as string)) as string[];
  const videoInfo = parseVideo(p.video_url);
  const media: ProductMediaItem[] = [
    ...imageList.map((src) => ({ type: "image" as const, src })),
    ...(videoInfo
      ? [
          {
            type: "video" as const,
            src:
              toSiteImageUrl(videoInfo.thumbnailUrl) ||
              toSiteImageUrl(p.image_url) ||
              imageList[0] ||
              "",
            info: videoInfo,
          },
        ]
      : []),
  ];
  const visibleThumbs = media.slice(thumbStart, thumbStart + 5);
  const keyFacts = productKeyFacts(p);
  const story = buildProductStory(p);
  const volumeFact = keyFacts.find((fact) => fact.label === "Volume")?.value ?? null;
  const vintageFact = keyFacts.find((fact) => fact.label === "Safra")?.value ?? null;
  const vintageLabel =
    vintageFact && story.vintageVaries && !vintageFact.includes("*")
      ? `${vintageFact}*`
      : vintageFact;
  const techRows: Array<[string, string | null | undefined]> = [
    ["Estilo", p.wine_style],
    ["Envelhecimento", p.aging],
    ["Taça recomendada", p.glass_type],
    ["Decantação", p.decanting],
  ];

  const approvedReviewCount = reviewsCountQ.data ?? 0;
  const productRating = Number(p.rating ?? 0);
  const hasProductRating = productRating > 0;
  const isFav = favs?.has(p.id) ?? false;
  const shownPrice = hasPixDiscount ? pixPrice : price;
  const savings = compare > shownPrice ? compare - shownPrice : 0;
  const cartItem = { id: p.id, name: p.name, slug: p.slug, price, image: p.image_url };
  function toggleFavorite() {
    toggleFav.mutate({
      product: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        image: p.image_url,
        country: p.country,
      },
      isFav,
    });
  }
  function addToCart() {
    add(cartItem, qty);
  }
  function buyNow() {
    add(cartItem, qty);
    closeDrawer();
    void navigate({ to: "/checkout" });
  }

  return (
    <div className="bg-background pb-[calc(6rem+env(safe-area-inset-bottom))] xl:pb-0">
      <BenefitsBar className="hidden xl:block" />
      <StoreContainer className="py-4 xl:py-6">
        <nav className="mb-3 truncate text-xs text-muted-foreground xl:mb-5">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>

          {p.wine_type && (
            <>
              <span className="mx-2">›</span>
              <span className="hover:text-primary">{p.wine_type}s</span>
            </>
          )}
          <span className="hidden sm:inline">
            <span className="mx-2">›</span>
            <span className="text-foreground">{p.name}</span>
          </span>
        </nav>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] xl:gap-10">
          {/* Galeria */}
          <div className="min-w-0">
            <ProductMediaMobileCarousel
              media={media}
              productName={p.name}
              discount={discount}
              bestSeller={!!p.best_seller}
              favorite={{ active: isFav, onToggle: toggleFavorite }}
            />
            <ProductMediaDesktopMain
              item={media[active]}
              productName={p.name}
              discount={discount}
              bestSeller={!!p.best_seller}
              favorite={{ active: isFav, onToggle: toggleFavorite }}
            />
            {media.length > 1 && (
              <div
                className="mt-4 hidden items-center gap-2 xl:flex"
                aria-label="Miniaturas do produto"
              >
                {media.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setThumbStart((value) => Math.max(0, value - 1))}
                    disabled={thumbStart === 0}
                    aria-label="Miniaturas anteriores"
                    className="grid h-9 w-7 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-25"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex min-w-0 flex-1 justify-center gap-2">
                  {visibleThumbs.map((item, offset) => {
                    const index = thumbStart + offset;
                    return (
                      <button
                        key={`${item.type}-${index}`}
                        type="button"
                        onClick={() => setActive(index)}
                        aria-label={
                          item.type === "video"
                            ? "Exibir vídeo do produto"
                            : `Exibir imagem ${index + 1} de ${media.length}`
                        }
                        aria-pressed={active === index}
                        className={`relative aspect-square min-w-0 max-w-20 flex-1 overflow-hidden rounded-sm bg-card p-1 transition-opacity ${
                          active === index
                            ? "ring-2 ring-inset ring-primary"
                            : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        <ProductImage
                          src={item.src}
                          alt=""
                          displaySize={80}
                          width={80}
                          height={80}
                          className="h-full w-full object-contain"
                        />
                        {item.type === "video" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-lg text-white">
                            ▶
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {media.length > 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      setThumbStart((value) => Math.min(Math.max(0, media.length - 5), value + 1))
                    }
                    disabled={thumbStart + 5 >= media.length}
                    aria-label="Próximas miniaturas"
                    className="grid h-9 w-7 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-25"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-32">
            <div>
              {p.brand && (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {p.brand}
                </p>
              )}
              <h1 className="text-2xl font-bold leading-snug text-foreground md:text-[1.75rem]">
                {p.name}
              </h1>
              <p className="mt-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                REF: {p.id.slice(0, 8).toUpperCase()}
              </p>
              <ProductSpecGrid
                tipo={story.tipo}
                volume={volumeFact}
                vintage={vintageLabel}
                country={p.country}
              />
              {story.vintageVaries && vintageLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  * O ano da safra pode variar conforme o estoque.
                </p>
              )}
              {hasProductRating && approvedReviewCount > 0 && (
                <a
                  href="#avaliacoes"
                  className="mt-2 flex w-fit items-center gap-2 text-sm transition-opacity hover:opacity-70"
                >
                  <div className="flex text-accent">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < Math.round(productRating) ? "fill-current" : ""}`}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground">
                    {productRating.toFixed(1)} · {approvedReviewCount}{" "}
                    {approvedReviewCount === 1 ? "avaliação" : "avaliações"}
                  </span>
                </a>
              )}
            </div>

            <div className="space-y-3 rounded-[1.25rem] border border-border bg-card p-4">
              {(compare > shownPrice || savings > 0) && (
                <div className="flex flex-wrap items-center gap-2">
                  {compare > shownPrice && (
                    <span className="text-sm text-muted-foreground line-through">
                      de {brl(compare)}
                    </span>
                  )}
                  {savings > 0 && (
                    <span className="rounded-full bg-buy/10 px-2.5 py-1 text-xs font-semibold text-buy">
                      Economize {brl(savings)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-primary">
                  {brl(shownPrice)}
                </span>
                {hasPixDiscount && (
                  <span className="text-sm font-medium text-muted-foreground">no PIX</span>
                )}
              </div>

              {hasPixDiscount && <PixDiscountBanner percent={pixDiscountPct} />}

              {hasPixDiscount && (
                <p className="text-sm text-muted-foreground">
                  ou <strong className="text-foreground">{brl(price)}</strong> no cartão
                </p>
              )}

              {pay.cardEnabled && featuredInstallment && (
                <div className="flex items-start gap-3 rounded-2xl bg-muted/70 px-3 py-3">
                  <CreditCard
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      Até{" "}
                      <strong>
                        {featuredInstallment.n}x de {brl(featuredInstallment.value)}
                      </strong>{" "}
                      {featuredInstallment.hasInterest ? "com juros" : "sem juros"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPayOpen(true)}
                      className="mt-1 text-left text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                    >
                      Ver todas as parcelas e formas de pagamento
                    </button>
                  </div>
                </div>
              )}
            </div>

            <PaymentMethodsDialog
              open={payOpen}
              onOpenChange={setPayOpen}
              price={price}
              pixPrice={pixPrice}
              cardPrice={cardPrice}
              pay={pay}
            />

            <div id="product-buy" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Quantidade</span>
                <div className="inline-flex h-11 items-center rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setQty((v) => Math.max(1, v - 1))}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
                    aria-label="Diminuir quantidade"
                    disabled={qty <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((v) => v + 1)}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {qty > 1 && p.stock > 0 && (
                <p className="text-xs text-muted-foreground">
                  {qty} unidades · total {brl(price * qty)}
                </p>
              )}
              <button
                type="button"
                disabled={p.stock <= 0}
                onClick={buyNow}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {p.stock > 0 ? "Comprar agora" : "Produto indisponível"}
                {p.stock > 0 && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                disabled={p.stock <= 0}
                onClick={addToCart}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-primary bg-card text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Adicionar ao carrinho
              </button>
            </div>

            <ProductShippingCalculator subtotal={price * qty} shipping={settings?.shipping} />

            <ProductTrustCards />

            <SuggestedProducts productId={p.id} />
          </aside>
        </div>

        <ProductStorySections
          name={p.name}
          story={story}
          fallbackHtml={story.about ? null : (p.description ?? p.short_description)}
          specs={[
            { icon: Home, label: "Produtor", value: p.brand },
            { icon: Grape, label: "Uva", value: story.grape },
            { icon: MapPin, label: "Região", value: story.region },
            { icon: Leaf, label: "Colheita", value: story.harvest },
            { icon: Percent, label: "Teor alcoólico", value: story.alcohol },
            { icon: Calendar, label: "Vinícola fundada", value: story.founded },
            { icon: GlassWater, label: "Classificação", value: p.classification },
            { icon: Wine, label: "Estilo", value: p.wine_style },
            { icon: Soup, label: "Envelhecimento", value: p.aging },
            { icon: Thermometer, label: "Temperatura de serviço", value: p.serving_temp },
            {
              icon: Utensils,
              label: "Harmonização",
              value:
                (p.harmonizacao && p.harmonizacao.length > 0
                  ? p.harmonizacao.join(", ")
                  : null) ?? p.harmonization,
            },
          ]}
        />

        {/* Conteúdo consultivo sob demanda, sem alongar a leitura principal. */}
        <div className="mt-8 lg:mt-10">
          <Accordion type="multiple" className="w-full">
            {videoInfo && (
              <AccordionItem value="video" className="border-border">
                <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-foreground hover:no-underline">
                  Vídeos do produto
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-sm bg-black">
                    {videoInfo.kind === "file" ? (
                      <video src={videoInfo.embedUrl} controls className="h-full w-full" />
                    ) : (
                      <iframe
                        src={videoInfo.embedUrl}
                        title={p.name}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full"
                      />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {techRows.some(([, v]) => v) && (
              <AccordionItem value="detalhes" className="border-border">
                <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-foreground hover:no-underline">
                  Mais detalhes
                </AccordionTrigger>
                <AccordionContent>
                  <dl className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
                    {techRows
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div
                          key={k}
                          className="flex justify-between gap-3 border-b border-border/60 py-2"
                        >
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="text-right font-medium text-foreground">{v}</dd>
                        </div>
                      ))}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>

        {approvedReviewCount > 0 && (
          <section id="avaliacoes" className="mt-10 scroll-mt-32 lg:mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Experiência de outros clientes
            </p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-primary">Avaliações</h2>
            <Reviews productId={p.id} compact />
          </section>
        )}

        {/* Produtos relacionados */}
        <RelatedProducts productId={p.id} country={p.country} wineType={p.wine_type} />
      </StoreContainer>
      <ProductMobileBuyBar
        image={p.image_url}
        name={p.name}
        price={price}
        compareAt={compare}
        quantity={qty}
        disabled={p.stock <= 0}
        onBuy={buyNow}
        watchId="product-buy"
      />
    </div>
  );
}

function CountryMark({ country }: { country: string }) {
  const flagUrl = flagUrlFor(country, 40);
  if (!flagUrl) return <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
  return (
    <img
      src={flagUrl}
      alt=""
      width={24}
      height={16}
      className="h-4 w-6 shrink-0 rounded-[2px] object-cover ring-1 ring-border"
    />
  );
}

function ProductSpecGrid({
  tipo,
  volume,
  vintage,
  country,
}: {
  tipo: string | null;
  volume: string | null;
  vintage: string | null;
  country: string | null;
}) {
  const cells = [
    { icon: Droplet, label: "Tipo", value: tipo },
    { icon: Wine, label: "Volume", value: volume },
    { icon: Calendar, label: "Safra", value: vintage },
    { icon: Globe, label: "País", value: country, flag: true },
  ].filter((cell) => cell.value);

  if (cells.length === 0) return null;

  return (
    <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-[1.25rem] border border-border bg-card">
      {cells.map((cell, index) => {
        const lastRowStart = cells.length - (cells.length % 2 === 0 ? 2 : 1);
        return (
          <div
            key={cell.label}
            className={`border-border px-4 py-3 ${index % 2 === 0 ? "border-r" : ""} ${
              index < lastRowStart ? "border-b" : ""
            }`}
          >
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {cell.flag && cell.value ? (
                <CountryMark country={cell.value} />
              ) : (
                <cell.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              )}
              {cell.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">{cell.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

type StorySpec = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
};

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        <span className="h-px w-8 bg-primary" aria-hidden />
        {kicker}
      </p>
      <h2 className="mt-2 text-3xl font-bold text-foreground">{title}</h2>
    </div>
  );
}

function ProductStorySections({
  name,
  story,
  fallbackHtml,
  specs,
}: {
  name: string;
  story: ReturnType<typeof buildProductStory>;
  fallbackHtml: string | null;
  specs: StorySpec[];
}) {
  const visibleSpecs = specs.filter((spec) => spec.value && String(spec.value).trim().length > 0);
  const taste = [
    { icon: Eye, label: "Cor", value: story.tasteColor },
    { icon: Wind, label: "Aroma", value: story.aroma },
    { icon: Wine, label: "Sabor", value: story.palate },
  ].filter((item) => item.value);

  return (
    <div className="mx-auto mt-16 max-w-3xl space-y-14">
      {story.about ? (
        <section id="descricao" className="scroll-mt-32">
          <SectionHeading kicker="Saiba mais" title="Sobre o vinho" />
          <p className="mt-4 text-lg italic leading-relaxed text-foreground/85">{story.about}</p>
        </section>
      ) : fallbackHtml ? (
        <section id="descricao" className="scroll-mt-32">
          <SectionHeading kicker="Saiba mais" title="Sobre o vinho" />
          <ProductHtmlContent html={fallbackHtml} className="mt-4" />
        </section>
      ) : null}

      {taste.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Na taça</h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[1.25rem] border border-border bg-card">
            {taste.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-start gap-3 px-4 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{label}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{value}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {story.awards.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Premiações</h3>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[1.25rem] border border-border bg-card">
            {story.awards.map((award) => (
              <li key={award.year} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-lg font-bold text-[#c6a35a]">{award.year}</span>
                <span className="flex flex-wrap gap-2">
                  {award.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded-md bg-muted px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {story.producer && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">O produtor</h3>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
            {story.producer.split(/\n{2,}/).map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}

      {story.disclaimer && (
        <p className="flex items-start gap-2 rounded-[1.25rem] bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {story.disclaimer}
        </p>
      )}

      {visibleSpecs.length > 0 && (
        <section>
          <SectionHeading kicker="Ficha técnica" title="Características" />
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSpecs.map(({ icon: Icon, label, value }) => (
              <li key={label} className="rounded-[1.25rem] border border-border bg-card px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {label}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold text-foreground">O que vem no pacote?</h2>
        <div className="mt-4 flex items-center gap-3 rounded-[1.25rem] border border-border bg-card px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Wine className="h-4 w-4" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">{packageLine(name)}</span>
            <span className="block text-sm text-muted-foreground">{name}</span>
          </span>
        </div>
      </section>
    </div>
  );
}

function SuggestedProducts({ productId }: { productId: string }) {
  const { data } = useQuery({
    queryKey: ["suggestions", productId],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("product_suggestions")
        .select("sort_order, suggested_product_id")
        .eq("product_id", productId)
        .order("sort_order");
      if (error) throw error;
      if (!links?.length) return [];

      const ids = links.map((l) => l.suggested_product_id);
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price, image_url, country, grape, rating")
        .in("id", ids)
        .eq("is_active", true);
      if (pErr) throw pErr;

      const byId = new Map((products ?? []).map((p) => [p.id, p]));
      return links.map((l) => byId.get(l.suggested_product_id)).filter(Boolean) as CardProduct[];
    },
  });

  if (!data?.length) return null;

  return (
    <div className="border-t border-border/70 pt-5">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">
        Produtos sugeridos
      </h3>
      <div className="space-y-3">
        {data.map((sp) => {
          const spPrice = Number(sp.price);
          const spCompare = sp.compare_at_price ? Number(sp.compare_at_price) : 0;
          return (
            <Link
              key={sp.id}
              to="/produto/$slug"
              params={{ slug: sp.slug }}
              className="flex items-center gap-3 rounded-sm transition hover:bg-accent/50"
            >
              {sp.image_url && (
                <ProductImage
                  src={sp.image_url}
                  alt={sp.name}
                  displaySize={56}
                  width={56}
                  height={74}
                  className="h-[74px] w-14 shrink-0 object-contain"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                  {sp.name}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  {spCompare > spPrice && (
                    <span className="text-xs font-medium text-[color:var(--sale)] line-through">
                      de {brl(spCompare)}
                    </span>
                  )}
                  <span className="text-sm font-bold text-[color:var(--buy)]">{brl(spPrice)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RelatedProducts({
  productId,
  country,
  wineType,
}: {
  productId: string;
  country: string | null;
  wineType: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["related", productId, country, wineType],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, slug, price, compare_at_price, image_url, country, grape, rating")
        .eq("is_active", true)
        .neq("id", productId)
        .limit(8);
      if (wineType) query = query.eq("wine_type", wineType);
      else if (country) query = query.eq("country", country);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CardProduct[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <ProductCarouselSection
      title="Produtos relacionados"
      subtitle="Outras escolhas para você"
      products={data.slice(0, 8)}
      contained={false}
      className="mt-10 py-0 lg:mt-12 lg:py-0"
    />
  );
}

function PaymentMethodsDialog({
  open,
  onOpenChange,
  price,
  pixPrice,
  cardPrice,
  pay,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  price: number;
  pixPrice: number;
  cardPrice: number;
  pay: PaymentSettings;
}) {
  const plan = installmentPlan(cardPrice, pay);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-2xl text-primary">
            <CreditCard className="h-6 w-6" strokeWidth={1.6} aria-hidden />
            Formas de pagamento
          </DialogTitle>
          <DialogDescription>Escolha a opção que melhor se encaixa para você.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pay.pixEnabled && (
            <section className="rounded-sm border border-border bg-cream p-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-primary">PIX</h4>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-2xl font-bold text-[color:var(--buy)]">
                  {brl(pixPrice)}
                </span>
                <span className="text-xs text-muted-foreground">
                  à vista{pay.pixDiscount > 0 ? ` — ${pay.pixDiscount}% de desconto` : ""}
                </span>
              </div>
            </section>
          )}

          {pay.boletoEnabled && (
            <section className="rounded-sm border border-border bg-cream p-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-primary">
                Boleto bancário
              </h4>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-2xl font-bold text-[color:var(--buy)]">
                  {brl(pixPrice)}
                </span>
                <span className="text-xs text-muted-foreground">
                  à vista — compensação em até 3 dias úteis
                </span>
              </div>
            </section>
          )}

          {pay.cardEnabled && (
            <section className="border-y border-border py-4">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                <CreditCard className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                Cartão de crédito
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Visa, Mastercard, Elo, Amex, Hipercard
              </p>
              <div className="mt-3 max-h-60 space-y-1 overflow-y-auto text-sm">
                {plan.map(({ n, value, total, hasInterest, rate }) => (
                  <div
                    key={n}
                    className="grid grid-cols-[auto_1fr] items-center gap-x-3 border-b border-border/60 py-2 last:border-0"
                  >
                    <span className="font-medium">
                      <strong>{n}x</strong> de {brl(value)}
                    </span>
                    <span className="text-right text-xs text-muted-foreground">
                      {hasInterest
                        ? `com juros (${String(rate).replace(".", ",")}%) · total ${brl(total)}`
                        : `sem juros · total ${brl(total)}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground">
            Valor à vista no PIX/boleto: {brl(pixPrice)}. Preço cheio: {brl(price)}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
