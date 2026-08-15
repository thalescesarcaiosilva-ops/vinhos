/** URL pública do site (produção). Usada em SEO, webhooks e links absolutos. */
export function getSiteUrl(): string {
  const raw =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_SITE_URL) ||
    (typeof process !== "undefined" && process.env.PUBLIC_SITE_URL) ||
    "https://www.galvaovinhos.com.br";
  return raw.replace(/\/+$/, "") + "/";
}

/** Monta URL absoluta sem barras duplas (ex.: base/ + /produto/x → base/produto/x). */
export function absoluteSiteUrl(path: string): string {
  const base = getSiteUrl().replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Converte caminho relativo de imagem do storage em URL absoluta para feeds (Google Merchant). */
export function toAbsoluteImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const base = getSiteUrl().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(path)) {
    // Reescreve hosts antigos (supabase.co, domínio sem www) para o domínio canônico do site.
    const storageMatch = path.match(
      /^https?:\/\/[^/]+(\/storage\/v1\/(?:object\/public|render\/image\/public)\/.+)$/i,
    );
    if (storageMatch) return `${base}${storageMatch[1]}`;
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
