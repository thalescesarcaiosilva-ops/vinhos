import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { brl } from "@/lib/format";
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
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Heart,
  Truck,
  Star,
  Share2,
  MapPin,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { POLICY_SLUGS } from "@/lib/policy-links";
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
import { calcShipping, type ShippingQuote } from "@/lib/shipping";
import { maskCEP, fetchAddressByCEP } from "@/lib/validation";
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
import { htmlToPlainText } from "@/lib/html-content";
import { PixDiscountBanner } from "@/components/store/PixDiscountBanner";
import { BenefitsBar } from "@/components/store/BenefitsBar";

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
  // Arquivo direto
  return { kind: "file", embedUrl: u, contentUrl: u };
}

async function fetchProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return data;

  const { count, error: reviewsError } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", data.id)
    .eq("is_approved", true);
  if (reviewsError) throw reviewsError;

  return { ...data, approved_review_count: count ?? 0 };
}

export const Route = createFileRoute("/produto/$slug")({
  component: ProductPage,
  loader: async ({ params, context }) => {
    const product = await fetchProductBySlug(params.slug);
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
        contentUrl: v.contentUrl,
        embedUrl: v.embedUrl,
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
  const { product: loaderProduct } = Route.useLoaderData();
  const { add } = useCart();
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const [qty, setQty] = useState(1);
  const [cep, setCep] = useState("");
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [shipAddr, setShipAddr] = useState<{ city: string; state: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [thumbStart, setThumbStart] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const { data: settings, isPending: settingsPending } = useStoreSettings();

  const q = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    initialData: loaderProduct,
    staleTime: 60_000,
  });

  const reviewsCountQ = useQuery({
    queryKey: ["reviews-count", q.data?.id],
    enabled: Boolean(q.data?.id),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("product_id", q.data!.id)
        .eq("is_approved", true);
      if (error) throw error;
      return count ?? 0;
    },
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
  const paymentMethodsImage = settings?.footer?.securityBadges?.find(
    (b) =>
      /pagamento/i.test(b.alt ?? "") || /formas-de-pagamento/i.test(b.href ?? ""),
  )?.imageUrl;
  const showPix = pay.pixEnabled;
  const pixDiscountPct = pay.pixDiscount || 0;
  const hasPixDiscount = showPix && pixDiscountPct > 0;
  const pixPrice = price * (1 - pixDiscountPct / 100);
  const cardPrice = price;
  const plan = installmentPlan(cardPrice, pay);
  const featuredInstallment = plan[plan.length - 1];
  const headlinePrice = showPix ? pixPrice : price;

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
  const harmonization =
    (p.harmonizacao && p.harmonizacao.length > 0 ? p.harmonizacao.join(", ") : null) ??
    p.harmonization ??
    null;
  const origin = [p.country, p.region].filter(Boolean).join(" · ");
  const primaryDetailsSource: Array<[string, string | null | undefined]> = [
    ["Produtor", p.brand],
    ["Origem", origin],
    ["Tipo", p.wine_type],
    ["Uva", p.grape],
    ["Classificação", p.classification],
  ];
  const primaryDetails = primaryDetailsSource.filter(
    ([, value]) => value && String(value).trim().length > 0,
  );
  const tastingNotesSource: Array<[string, string | null | undefined]> = [
    ["Visual", p.visual_notes],
    ["Aroma", p.nose_notes],
    ["Paladar", p.palate_notes],
    ["Harmonização", harmonization],
  ];
  const tastingNotes = tastingNotesSource.filter(
    ([, value]) => value && String(value).trim().length > 0,
  );
  const shortDescription = htmlToPlainText(p.short_description);

  const techRows: Array<[string, string | null | undefined]> = [
    ["Safra", p.vintage],
    ["Estilo", p.wine_style],
    ["Envelhecimento", p.aging],
    ["Teor alcoólico", p.alcohol_content],
    ["Temperatura de serviço", p.serving_temp],
    ["Taça recomendada", p.glass_type],
    ["Decantação", p.decanting],
  ];

  const productUrl = typeof window !== "undefined" ? window.location.href : "";
  const approvedReviewCount = reviewsCountQ.data ?? 0;
  const productRating = Number(p.rating ?? 0);
  const hasProductRating = productRating > 0;

  async function handleShare() {
    const shareData = {
      title: p.name,
      text: htmlToPlainText(p.short_description) || p.name,
      url: productUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        return;
      }
    } else {
      try {
        await navigator.clipboard.writeText(productUrl);
        toast.success("Link copiado!");
      } catch {
        toast.error("Não foi possível compartilhar");
      }
    }
  }

  async function calcFreight() {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      toast.error("CEP inválido");
      return;
    }
    setCepLoading(true);
    try {
      const addr = await fetchAddressByCEP(cep);
      if (addr) setShipAddr({ city: addr.city, state: addr.state });
      else setShipAddr(null);
      const result = calcShipping(price * qty, cep, settings?.shipping, addr?.state);
      if (result.length === 0) {
        toast.error("Não há métodos de frete disponíveis para este CEP");
        return;
      }
      setQuotes(result);
    } finally {
      setCepLoading(false);
    }
  }

  function addToCart() {
    add({ id: p.id, name: p.name, slug: p.slug, price, image: p.image_url }, qty);
    toast.success("Adicionado ao carrinho");
  }

  return (
    <div className="bg-background pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
      <BenefitsBar />
      <StoreContainer className="py-6">
        <nav className="mb-5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>

          {p.wine_type && (
            <>
              <span className="mx-2">›</span>
              <span className="hover:text-primary">{p.wine_type}s</span>
            </>
          )}
          <span className="mx-2">›</span>
          <span className="text-foreground">{p.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[40fr_32fr_28fr] lg:items-start xl:gap-10">
          {/* Galeria */}
          <div className="min-w-0">
            <ProductMediaMobileCarousel
              media={media}
              productName={p.name}
              discount={discount}
              bestSeller={!!p.best_seller}
              country={p.country}
              flagUrl={flagUrlFor(p.country)}
            />
            <ProductMediaDesktopMain
              item={media[active]}
              productName={p.name}
              discount={discount}
              bestSeller={!!p.best_seller}
              country={p.country}
              flagUrl={flagUrlFor(p.country)}
            />
            {media.length > 1 && (
              <div
                className="mt-4 hidden items-center gap-2 lg:flex"
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

          {/* Informações */}
          <section className="min-w-0 space-y-4">
            <div>
              <h1 className="font-serif text-2xl font-bold leading-tight text-foreground md:text-3xl">
                {p.name}
              </h1>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                ref: {p.id.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {hasProductRating && (
              <a
                href="#avaliacoes"
                className="flex w-fit items-center gap-2 text-sm transition-opacity hover:opacity-70"
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
                  {productRating.toFixed(1)}
                  {approvedReviewCount > 0 && (
                    <>
                      {" "}
                      · {approvedReviewCount}{" "}
                      {approvedReviewCount === 1 ? "avaliação" : "avaliações"}
                    </>
                  )}
                </span>
              </a>
            )}

            {shortDescription && (
              <div>
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/75">
                  {shortDescription}
                </p>
                <a
                  href="#descricao"
                  className="mt-1 inline-block text-xs font-semibold text-primary transition-opacity hover:opacity-70"
                >
                  Ver descrição completa
                </a>
              </div>
            )}

            {primaryDetails.length > 0 && (
              <dl className="divide-y divide-border/50 border-y border-border/60">
                {primaryDetails.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5 text-sm">
                    <dt className="font-medium text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 whitespace-pre-line break-words text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {(() => {
                const isFav = favs?.has(p.id) ?? false;
                return (
                  <button
                    type="button"
                    onClick={() =>
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
                      })
                    }
                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Heart className={`h-4 w-4 ${isFav ? "fill-primary text-primary" : ""}`} />
                    {isFav ? "Remover dos favoritos" : "Favoritar"}
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
            </div>
          </section>

          {/* Compra e frete */}
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-32">
            <div className="space-y-1">
              {compare > price && (
                <div className="text-sm text-muted-foreground line-through">de {brl(compare)}</div>
              )}

              <div className="flex items-baseline gap-2 pt-1">
                <span className="font-serif text-3xl font-bold text-[color:var(--primary)] xl:text-4xl">
                  {brl(hasPixDiscount ? pixPrice : price)}
                </span>
                {hasPixDiscount && (
                  <span className="text-sm font-medium text-muted-foreground">no PIX</span>
                )}
              </div>

              {hasPixDiscount && <PixDiscountBanner percent={pixDiscountPct} />}

              {hasPixDiscount && (
                <div className="text-sm text-muted-foreground">
                  ou <strong className="text-foreground">{brl(price)}</strong> no cartão
                </div>
              )}

              {pay.cardEnabled && featuredInstallment && (
                <div className="mt-3 flex items-start gap-3 border-y border-border/70 py-3">
                  <CreditCard
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Cartão de crédito
                    </p>
                    <p className="mt-0.5 text-sm text-foreground">
                      Até{" "}
                      <strong>
                        {featuredInstallment.n}x de {brl(featuredInstallment.value)}
                      </strong>{" "}
                      {featuredInstallment.hasInterest ? "com juros" : "sem juros"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPayOpen(true)}
                      className="mt-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Ver todas as parcelas e formas de pagamento
                    </button>
                    {paymentMethodsImage && (
                      <img
                        src={toSiteImageUrl(paymentMethodsImage)}
                        alt="Bandeiras e formas de pagamento aceitas"
                        width={280}
                        height={30}
                        loading="lazy"
                        decoding="async"
                        className="mt-2 h-8 w-auto max-w-full object-contain object-left"
                      />
                    )}
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

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Quantidade</span>
                <div className="inline-flex h-10 items-center rounded-sm bg-muted/60">
                  <button
                    type="button"
                    onClick={() => setQty((v) => Math.max(1, v - 1))}
                    className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-9 text-center text-sm font-semibold" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((v) => v + 1)}
                    className="flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={p.stock <= 0}
                onClick={addToCart}
                className="min-h-12 w-full rounded-sm bg-[color:var(--buy)] px-6 py-3 text-sm font-bold uppercase tracking-wider text-[color:var(--buy-foreground)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {p.stock > 0 ? "Comprar agora" : "Produto indisponível"}
              </button>
            </div>

            <SuggestedProducts productId={p.id} />

            <section className="border-t border-border/70 pt-5" aria-labelledby="shipping-title">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 id="shipping-title" className="text-sm font-bold">
                    Calcule o frete
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Consulte prazo e valor para seu CEP ·{" "}
                    <Link
                      to="/politicas/$slug"
                      params={{ slug: POLICY_SLUGS.shipping }}
                      className="font-medium text-primary hover:underline"
                    >
                      Política de frete
                    </Link>
                    {" · "}
                    <Link
                      to="/politicas/$slug"
                      params={{ slug: POLICY_SLUGS.returns }}
                      className="font-medium text-primary hover:underline"
                    >
                      Trocas e devoluções
                    </Link>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">CEP</span>
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={cep}
                    onChange={(e) => setCep(maskCEP(e.target.value))}
                    placeholder="00000-000"
                    className="w-full border-0 border-b border-border bg-transparent px-0 py-2 text-sm outline-none transition-colors focus:border-primary"
                  />
                </label>
                <button
                  type="button"
                  onClick={calcFreight}
                  disabled={cepLoading}
                  className="min-h-10 px-1 text-sm font-bold uppercase tracking-wide text-primary transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  {cepLoading ? "Calculando…" : "Calcular"}
                </button>
              </div>
              {shipAddr && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Entrega para{" "}
                  <strong className="text-foreground">
                    {shipAddr.city} / {shipAddr.state}
                  </strong>
                </div>
              )}
              {quotes && (
                <ul className="mt-3 divide-y divide-border/60 border-t border-border/60 text-sm">
                  {quotes.map((q) => (
                    <li key={q.label} className="flex items-center justify-between gap-3 py-2.5">
                      <span>
                        <strong>{q.label}</strong> · {q.eta}
                      </span>
                      <span className="font-bold text-primary">
                        {q.price === 0 ? "Grátis" : brl(q.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>

        <section
          id="descricao"
          className="mt-10 scroll-mt-32 border-t border-border/60 pt-8 lg:mt-12 lg:pt-10"
        >
          <div className="w-full text-left [&_*]:!text-left">
            {p.description || p.short_description ? (
              <ProductHtmlContent
                html={p.description ?? p.short_description}
                className="text-left [&_*]:!text-left"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Sem descrição disponível.</p>
            )}
          </div>
        </section>

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

            {tastingNotes.length > 0 && (
              <AccordionItem value="degustacao" className="border-border">
                <AccordionTrigger className="text-sm font-semibold uppercase tracking-wider text-foreground hover:no-underline">
                  Notas de degustação
                </AccordionTrigger>
                <AccordionContent>
                  <dl className="grid gap-x-10 md:grid-cols-2">
                    {tastingNotes.map(([label, value]) => (
                      <div key={label} className="border-b border-border/60 py-3">
                        <dt className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm leading-relaxed text-foreground/75">{value}</dd>
                      </div>
                    ))}
                  </dl>
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

        <section id="avaliacoes" className="mt-10 scroll-mt-32 lg:mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Experiência de outros clientes
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-primary">Avaliações</h2>
          <Reviews productId={p.id} compact />
        </section>

        {/* Produtos relacionados */}
        <RelatedProducts productId={p.id} country={p.country} wineType={p.wine_type} />
      </StoreContainer>
      <ProductMobileBuyBar
        image={p.image_url}
        name={p.name}
        price={headlinePrice}
        quantity={qty}
        disabled={p.stock <= 0}
        onBuy={addToCart}
      />
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
                    <span className="text-xs text-muted-foreground line-through">
                      {brl(spCompare)}
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
