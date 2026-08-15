import { isStorageObjectUrl, toTransformedImageUrl, toSiteImageUrl } from "@/lib/image-url";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Tamanho aproximado de exibição em CSS px (1x). Usado para gerar srcset. */
  displaySize?: number;
  /** Priorize o carregamento (use somente para a imagem LCP/hero acima da dobra). */
  priority?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
};

/**
 * Imagem de produto com WebP + srcset. Nunca aponta o <img> para o PNG/JPG
 * original do Storage — só para a variante renderizada (evita download 2–10× maior).
 */
export function ProductImage({
  src,
  alt,
  className,
  displaySize = 260,
  priority = false,
  width,
  height,
  sizes,
}: Props) {
  const normalized = toSiteImageUrl(src);
  if (!normalized) return null;

  const isStorage = isStorageObjectUrl(src) || isStorageObjectUrl(normalized);

  const loading = priority ? "eager" : "lazy";
  const fetchPriority = priority ? "high" : "auto";

  if (!isStorage) {
    return (
      <img
        src={normalized}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        width={width}
        height={height}
        className={className ?? "max-h-full max-w-full object-contain"}
      />
    );
  }

  // 1x + 2x. Cards (~260): no 3×780. Galeria (~480): até 960.
  const w1 = Math.round(displaySize);
  const w2 = Math.min(1200, Math.round(displaySize * 2));
  const webp = (w: number) =>
    toTransformedImageUrl(src, { width: w, quality: 70, format: "webp", resize: "contain" });
  const computedSizes =
    sizes ?? `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, ${displaySize}px`;
  const imgClass = className ?? "h-full w-full max-h-full max-w-full object-contain";
  const primary = webp(w1);

  return (
    <img
      src={primary}
      srcSet={`${webp(w1)} ${w1}w, ${webp(w2)} ${w2}w`}
      sizes={computedSizes}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      className={imgClass}
    />
  );
}
