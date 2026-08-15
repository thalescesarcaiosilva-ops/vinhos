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
  /**
   * Largura total da tela, altura pela proporção da imagem enviada
   * (sem object-cover / sem crop nas laterais).
   */
  fullscreen?: boolean;
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
 * Banner WebP responsivo.
 * Em fullscreen: 100vw de largura e altura natural da arte (proporção enviada).
 */
export function HeroBanner({
  src,
  alt,
  linkUrl,
  className,
  priority = true,
  aspectClassName = "aspect-[1600/386]",
  fill = "contain",
  fullscreen = false,
}: Props) {
  const resize = fullscreen ? "contain" : fill;
  const widths = fullscreen ? [640, 960, 1280, 1600, 1920, 2400] : [800, 1280, 1600];
  const srcSet = buildSrcSet(src, widths, resize);
  const fallback =
    toTransformedImageUrl(src, {
      width: fullscreen ? 1920 : 1280,
      quality: 80,
      format: "webp",
      resize,
    }) || toSiteImageUrl(src);

  const img = fullscreen ? (
    <img
      src={fallback}
      srcSet={srcSet || undefined}
      sizes="100vw"
      alt={alt}
      width={1920}
      height={720}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className ?? "block h-auto w-full"}
    />
  ) : (
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

  const box = fullscreen ? (
    <div className="w-full bg-muted">{img}</div>
  ) : (
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

/** Hero da home: desktop e mobile na proporção original do arquivo enviado. */
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
    return <div className="min-h-[12rem] w-full bg-muted" aria-hidden />;
  }

  return (
    <>
      {desktop && (
        <div className="hidden md:block">
          <HeroBanner src={desktop} alt={alt} linkUrl={desktopLinkUrl} fill="contain" fullscreen />
        </div>
      )}
      {mobile && (
        <div className={desktop ? "md:hidden" : ""}>
          <HeroBanner
            src={mobile}
            alt={alt}
            linkUrl={mobileLinkUrl ?? desktopLinkUrl}
            fill="contain"
            fullscreen
          />
        </div>
      )}
    </>
  );
}
