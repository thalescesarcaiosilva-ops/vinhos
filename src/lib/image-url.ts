import { getStorageHostPrefixes, getSupabaseStorageOrigin } from "./supabase-storage-origin";

// Caminhos canônicos no banco: /storage/v1/object/public/product-images/{arquivo}
// Em produção: path relativo no domínio da loja (proxy Vercel → Supabase).
// Em localhost: URL absoluta do projeto — o proxy /storage no vite/nitro sem Wrangler
// costuma responder 404.
function stripHost(url: string): string {
  for (const host of getStorageHostPrefixes()) {
    if (url.startsWith(host + "/storage/")) return url.slice(host.length);
  }
  return url;
}

function isLocalDevSite(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }
  const site =
    (typeof process !== "undefined" &&
      (process.env.VITE_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL)) ||
    "";
  return /localhost|127\.0\.0\.1/i.test(site) || site === "";
}

/** Prefixo para URLs de Storage: absoluto no local, relativo em produção. */
function storageUrlPrefix(): string {
  if (!isLocalDevSite()) return "";
  try {
    return getSupabaseStorageOrigin();
  } catch {
    return "";
  }
}

function toStoragePath(url: string): string | null {
  const stripped = stripHost(url);
  return stripped.startsWith("/storage/v1/") ? stripped : null;
}

export function isStorageObjectUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = toStoragePath(url);
  return !!path?.startsWith("/storage/v1/object/public/");
}

/** Normaliza URL de Storage (relativa em prod; absoluta no localhost). */
export function toSiteImageUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const path = toStoragePath(url as string);
  if (path) return `${storageUrlPrefix()}${path}` as T;
  const stripped = stripHost(url as string);
  if (stripped.startsWith("/storage/")) return `${storageUrlPrefix()}${stripped}` as T;
  return stripped as T;
}

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
  format?: "webp" | "origin";
  resize?: "cover" | "contain" | "fill";
};

/** Parâmetros padrão para imagens no Google Merchant (≥800px, WebP otimizado). */
export const MERCHANT_IMAGE_TRANSFORM: ImageTransform = {
  width: 1200,
  height: 1200,
  quality: 85,
  format: "webp",
  resize: "contain",
};

/**
 * URL de imagem otimizada para feeds Merchant / JSON-LD (render WebP 1200×1200).
 * Evita PNGs enormes em /object/public/ que o Google demora ou falha ao processar.
 */
export function toMerchantImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!isStorageObjectUrl(url) && !isStorageObjectUrl(toSiteImageUrl(url))) {
    return toSiteImageUrl(url);
  }
  return toTransformedImageUrl(url, MERCHANT_IMAGE_TRANSFORM);
}

/**
 * Retorna a URL transformada (WebP + resize) para uma imagem do Storage do
 * Supabase. Para qualquer URL que não seja /storage/v1/object/public/* (por
 * exemplo, asset.json hospedado no CDN), apenas devolve a URL normalizada
 * para o domínio do site.
 */
export function toTransformedImageUrl(
  url: string | null | undefined,
  opts: ImageTransform = {},
): string {
  if (!url) return "";
  const path = toStoragePath(url);
  // Só transforma se for um caminho de object/public — o restante (assets
  // hospedados, dataURLs, etc.) segue como está.
  if (!path?.startsWith("/storage/v1/object/public/")) return stripHost(url);

  const rendered = path.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  const params = new URLSearchParams();
  if (opts.width) params.set("width", String(opts.width));
  if (opts.height) params.set("height", String(opts.height));
  params.set("quality", String(opts.quality ?? 75));
  params.set("format", opts.format ?? "webp");
  if (opts.resize) params.set("resize", opts.resize);
  const qs = params.toString();
  const withHost = `${storageUrlPrefix()}${rendered}`;
  return qs ? `${withHost}?${qs}` : withHost;
}
