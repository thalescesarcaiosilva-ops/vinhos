import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";

type Props = {
  src: string;
  alt: string;
  linkUrl?: string | null;
  className?: string;
  priority?: boolean;
  /** Reserva espaço e evita CLS (proporção do banner da loja). */
  aspectClassName?: string;
  /** contain = sem crop; cover = preenche a área (só em slots com aspect fixo). */
  fill?: "contain" | "cover";
};

function buildSrcSet(src: string, widths: number[], resize: "contain" | "cover") {
  return widths
    .map((width) => {
      const url = toTransformedImageUrl(src, {
        width,
        quality: resize === "cover" ? 78 : 80,
        format: "webp",
        resize,
      });
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Banner WebP responsivo com caixa de proporção fixa (CLS estável, sem crop forçado).
 */
export function HeroBanner({
  src,
  alt,
  linkUrl,
  className,
  priority = true,
  aspectClassName = "aspect-[1600/386]",
  fill = "contain",
}: Props) {
  const widths = [800, 1280, 1600];
  const srcSet = buildSrcSet(src, widths, fill);
  const fallback =
    toTransformedImageUrl(src, {
      width: 1280,
      quality: 80,
      format: "webp",
      resize: fill,
    }) || toSiteImageUrl(src);

  const img = (
    <img
      src={fallback}
      srcSet={srcSet || undefined}
      sizes="100vw"
      alt={alt}
      width={1920}
      height={386}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={
        className ??
        (fill === "cover"
          ? "absolute inset-0 h-full w-full object-cover object-center"
          : "absolute inset-0 h-full w-full object-contain")
      }
    />
  );

  const box = (
    <div className={`relative w-full overflow-hidden bg-muted ${aspectClassName}`}>{img}</div>
  );

  const href = linkUrl?.trim();
  if (href) {
    return (
      <a href={href} className="block w-full">
        {box}
      </a>
    );
  }
  return box;
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
 * object-contain + aspect-ratio reservam espaço sem cortar a arte.
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

  if (!desktop && !mobile) {
    return (
      <div
        className="min-h-[12rem] w-full bg-muted"
        style={{ aspectRatio: "1920 / 720" }}
        aria-hidden
      />
    );
  }

  const desktopSrcSet = desktop ? buildSrcSet(desktop, [960, 1280, 1600, 1920, 2400], "contain") : "";
  const mobileSrcSet = mobile ? buildSrcSet(mobile, [640, 960, 1280], "contain") : "";
  const imgSrc =
    toTransformedImageUrl(mobile || desktop!, {
      width: 960,
      quality: 80,
      format: "webp",
      resize: "contain",
    }) || toSiteImageUrl(mobile || desktop!);

  const href = (mobileLinkUrl ?? desktopLinkUrl)?.trim();

  const picture = (
    <div className="w-full bg-muted" style={{ aspectRatio: "1920 / 720" }}>
      <picture>
        {desktop && (
          <source media="(min-width: 768px)" srcSet={desktopSrcSet || undefined} sizes="100vw" />
        )}
        <img
          src={imgSrc}
          srcSet={mobileSrcSet || desktopSrcSet || undefined}
          sizes="100vw"
          alt={alt}
          width={1920}
          height={720}
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          className="block h-full w-full object-contain object-center"
        />
      </picture>
    </div>
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
  return (
    toTransformedImageUrl(src, {
      width: 960,
      quality: 80,
      format: "webp",
      resize: "contain",
    }) || toSiteImageUrl(src)
  );
}
