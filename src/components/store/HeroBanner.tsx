import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";

type Props = {
  src: string;
  alt: string;
  linkUrl?: string | null;
  className?: string;
  priority?: boolean;
};

/** Largura 100% e altura natural: o banner nunca é cortado nem esticado. */
const BANNER_IMG_CLASS = "block h-auto w-full";

/** Mesmo limite do breakpoint `xl` do Tailwind: tablet recebe a arte mobile. */
const DESKTOP_MEDIA = "(min-width: 1280px)";

/** Só varia a largura — a altura sai da proporção da própria arte. */
function buildSrcSet(src: string, widths: number[]) {
  return widths
    .map((width) => {
      const url = toTransformedImageUrl(src, { width, quality: 80, format: "webp" });
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean)
    .join(", ");
}

function bannerSrc(src: string, width: number) {
  return toTransformedImageUrl(src, { width, quality: 80, format: "webp" }) || toSiteImageUrl(src);
}

/** Banner WebP responsivo, na proporção original da imagem. */
export function HeroBanner({ src, alt, linkUrl, className, priority = true }: Props) {
  const srcSet = buildSrcSet(src, [800, 1280, 1600]);

  const img = (
    <img
      src={bannerSrc(src, 1280)}
      srcSet={srcSet || undefined}
      sizes="100vw"
      alt={alt}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className ? `${BANNER_IMG_CLASS} ${className}` : BANNER_IMG_CLASS}
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
};

/**
 * Hero da home com <picture>: um único <img> LCP (não baixa desktop+mobile juntos).
 * Bots veem a imagem no HTML; o media escolhe a arte certa no browser.
 */
export function HomeHeroBanner({
  desktopSrc,
  mobileSrc,
  alt,
  desktopLinkUrl,
  mobileLinkUrl,
}: HomeHeroProps) {
  const desktop = desktopSrc?.trim();
  const mobile = mobileSrc?.trim() || desktop;

  if (!desktop && !mobile) return null;

  const desktopSrcSet = desktop ? buildSrcSet(desktop, [960, 1280, 1600, 1920, 2400]) : "";
  const mobileSrcSet = mobile ? buildSrcSet(mobile, [640, 960, 1280]) : "";

  const href = (mobileLinkUrl ?? desktopLinkUrl)?.trim();

  const picture = (
    <picture>
      {desktop && (
        <source media={DESKTOP_MEDIA} srcSet={desktopSrcSet || undefined} sizes="100vw" />
      )}
      <img
        src={bannerSrc(mobile || desktop!, 960)}
        srcSet={mobileSrcSet || desktopSrcSet || undefined}
        sizes="100vw"
        alt={alt}
        fetchPriority="high"
        loading="eager"
        decoding="sync"
        className={BANNER_IMG_CLASS}
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

/** URL para preload do LCP no <head> da home. */
export function homeHeroLcpPreloadHref(
  mobileSrc?: string | null,
  desktopSrc?: string | null,
): string | null {
  const src = (mobileSrc || desktopSrc)?.trim();
  if (!src) return null;
  return bannerSrc(src, 960);
}
