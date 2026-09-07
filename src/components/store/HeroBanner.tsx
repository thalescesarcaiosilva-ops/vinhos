import { isStorageObjectUrl, toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";

/** Dimensões da arte original, quando conhecidas (colunas `width`/`height` de `banners`). */
export type BannerSize = {
  width?: number | null;
  height?: number | null;
};

type Props = BannerSize & {
  src: string;
  alt: string;
  linkUrl?: string | null;
  className?: string;
  priority?: boolean;
};

/** Largura 100% e altura natural: o banner nunca é cortado nem esticado. */
const BANNER_IMG_CLASS = "block h-auto w-full";

/** Reserva a caixa pela proporção real da arte — regra em styles.css. */
const RATIO_CLASS = "hero-banner-img";

/** Mesmo limite do breakpoint `xl` do Tailwind: tablet recebe a arte mobile. */
const DESKTOP_MEDIA = "(min-width: 1280px)";
const MOBILE_MEDIA = "(max-width: 1279.98px)";

const DESKTOP_WIDTHS = [960, 1280, 1600, 1920, 2400];
const MOBILE_WIDTHS = [640, 960, 1280];
const STRIP_WIDTHS = [800, 1280, 1600];

/**
 * `resize: "contain"` é obrigatório aqui. Sem ele o Supabase aplica `fill`, que
 * recorta as laterais sempre que a largura pedida é menor que a da arte
 * (1920×554 pedido a 1280 volta 1280×554 — 640px de arte perdidos).
 */
function bannerVariant(src: string, width: number) {
  return toTransformedImageUrl(src, { width, quality: 80, format: "webp", resize: "contain" });
}

/** Descarta larguras acima da arte: o Storage não faz upscale, só repete bytes. */
function usableWidths(widths: number[], intrinsicWidth?: number | null) {
  if (!intrinsicWidth || intrinsicWidth <= 0) return widths;
  const withinArt = widths.filter((width) => width < intrinsicWidth);
  return [...withinArt, intrinsicWidth];
}

/** srcset só faz sentido para imagens do Storage — o resto não tem variantes. */
function buildSrcSet(src: string, widths: number[], intrinsicWidth?: number | null) {
  if (!isStorageObjectUrl(src)) return "";
  return usableWidths(widths, intrinsicWidth)
    .map((width) => `${bannerVariant(src, width)} ${width}w`)
    .join(", ");
}

function bannerSrc(src: string, width: number, intrinsicWidth?: number | null) {
  const capped = intrinsicWidth && intrinsicWidth > 0 ? Math.min(width, intrinsicWidth) : width;
  return bannerVariant(src, capped) || toSiteImageUrl(src);
}

function ratio(size: BannerSize) {
  return size.width && size.height ? `${size.width} / ${size.height}` : null;
}

/** Vars consumidas por `.hero-banner-img`; ausentes = `aspect-ratio: auto`. */
function ratioStyle(mobile: BannerSize, desktop?: BannerSize) {
  const mobileRatio = ratio(mobile);
  const desktopRatio = desktop ? ratio(desktop) : null;
  if (!mobileRatio && !desktopRatio) return undefined;
  return {
    ...(mobileRatio ? { "--hero-ratio-mobile": mobileRatio } : {}),
    ...(desktopRatio ? { "--hero-ratio-desktop": desktopRatio } : {}),
  } as React.CSSProperties;
}

/** Banner WebP responsivo, na proporção original da imagem. */
export function HeroBanner({
  src,
  alt,
  linkUrl,
  className,
  priority = true,
  width,
  height,
}: Props) {
  const srcSet = buildSrcSet(src, STRIP_WIDTHS, width);
  const style = ratioStyle({ width, height });

  const img = (
    <img
      src={bannerSrc(src, 1280, width)}
      srcSet={srcSet || undefined}
      sizes="100vw"
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      style={style}
      className={[BANNER_IMG_CLASS, RATIO_CLASS, className].filter(Boolean).join(" ")}
    />
  );

  const href = linkUrl?.trim();
  if (href) {
    return (
      <a href={href} className="block w-full">
        {img}
      </a>
    );
  }
  return img;
}

type HomeHeroProps = {
  desktopSrc?: string | null;
  mobileSrc?: string | null;
  alt: string;
  desktopLinkUrl?: string | null;
  mobileLinkUrl?: string | null;
  desktopSize?: BannerSize;
  mobileSize?: BannerSize;
};

/** Resolve qual arte e quais dimensões valem para cada breakpoint. */
function resolveArts({ desktopSrc, mobileSrc, desktopSize, mobileSize }: HomeHeroProps) {
  const desktop = desktopSrc?.trim();
  const mobile = mobileSrc?.trim() || desktop;
  const desktopDims = desktopSize ?? {};
  // Sem arte mobile própria, o mobile exibe a desktop — e herda as dimensões dela.
  const mobileDims = mobileSrc?.trim() ? (mobileSize ?? {}) : desktopDims;
  return { desktop, mobile, desktopDims, mobileDims };
}

/**
 * Hero da home com <picture>: um único <img> LCP (não baixa desktop+mobile juntos).
 * Bots veem a imagem no HTML; o media escolhe a arte certa no browser.
 */
export function HomeHeroBanner(props: HomeHeroProps) {
  const { alt, desktopLinkUrl, mobileLinkUrl } = props;
  const { desktop, mobile, desktopDims, mobileDims } = resolveArts(props);

  if (!desktop && !mobile) return null;

  const desktopSrcSet = desktop ? buildSrcSet(desktop, DESKTOP_WIDTHS, desktopDims.width) : "";
  const mobileSrcSet = mobile ? buildSrcSet(mobile, MOBILE_WIDTHS, mobileDims.width) : "";

  const href = (mobileLinkUrl ?? desktopLinkUrl)?.trim();

  const picture = (
    <picture>
      {desktop && (
        <source
          media={DESKTOP_MEDIA}
          srcSet={desktopSrcSet || undefined}
          sizes="100vw"
          width={desktopDims.width ?? undefined}
          height={desktopDims.height ?? undefined}
        />
      )}
      <img
        src={bannerSrc(mobile || desktop!, 960, mobileDims.width)}
        srcSet={mobileSrcSet || desktopSrcSet || undefined}
        sizes="100vw"
        alt={alt}
        width={mobileDims.width ?? undefined}
        height={mobileDims.height ?? undefined}
        fetchPriority="high"
        loading="eager"
        decoding="sync"
        style={ratioStyle(mobileDims, desktopDims)}
        className={`${BANNER_IMG_CLASS} ${RATIO_CLASS}`}
      />
    </picture>
  );

  if (href) {
    return (
      <a href={href} className="block w-full">
        {picture}
      </a>
    );
  }
  return picture;
}

type PreloadLink = {
  rel: "preload";
  as: "image";
  type: "image/webp";
  media: string;
  href: string;
  imageSrcSet?: string;
  imageSizes?: string;
  fetchPriority: "high";
};

/**
 * Preload do LCP no <head> da home. Precisa espelhar exatamente o `srcset`/`sizes`
 * do <picture>: um preload de URL única faz o browser baixar outra variante e
 * jogar o preload fora.
 */
export function homeHeroPreloadLinks(props: HomeHeroProps): PreloadLink[] {
  const { desktop, mobile, desktopDims, mobileDims } = resolveArts(props);
  const links: PreloadLink[] = [];

  if (mobile) {
    links.push({
      rel: "preload",
      as: "image",
      type: "image/webp",
      media: MOBILE_MEDIA,
      href: bannerSrc(mobile, 960, mobileDims.width),
      imageSrcSet: buildSrcSet(mobile, MOBILE_WIDTHS, mobileDims.width) || undefined,
      imageSizes: "100vw",
      fetchPriority: "high",
    });
  }
  if (desktop) {
    links.push({
      rel: "preload",
      as: "image",
      type: "image/webp",
      media: DESKTOP_MEDIA,
      href: bannerSrc(desktop, 1600, desktopDims.width),
      imageSrcSet: buildSrcSet(desktop, DESKTOP_WIDTHS, desktopDims.width) || undefined,
      imageSizes: "100vw",
      fetchPriority: "high",
    });
  }
  return links;
}
