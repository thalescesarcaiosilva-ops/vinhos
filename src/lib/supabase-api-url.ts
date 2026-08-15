const SITE_HOST_RE = /galvaovinhos\.com|vinellevinhos\.com|vercel\.app/i;

function readSupabaseUrlFromEnv(): string | undefined {
  const fromVite =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
  const fromNode = typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined;
  const raw = (fromVite || fromNode)?.trim();
  return raw || undefined;
}

/** URL real do projeto Supabase (servidor, scripts, proxy upstream). */
export function getSupabaseProjectUrl(): string {
  const raw = readSupabaseUrlFromEnv();
  if (!raw) {
    throw new Error(
      "Missing VITE_SUPABASE_URL / SUPABASE_URL. Use https://aufvvgytbrstsrfomngm.supabase.co — não use o domínio do site.",
    );
  }

  if (SITE_HOST_RE.test(raw) && !raw.includes("supabase.co")) {
    throw new Error(
      "VITE_SUPABASE_URL está com o domínio da loja. Configure https://aufvvgytbrstsrfomngm.supabase.co (não galvaovinhos.com / vinellevinhos.com nem PUBLIC_SITE_URL).",
    );
  }

  let url = raw.replace(/\/+$/, "");
  if (url.startsWith("http://")) {
    url = `https://${url.slice("http://".length)}`;
  }
  if (!url.startsWith("https://")) {
    throw new Error(`SUPABASE_URL deve usar HTTPS: ${url}`);
  }
  return url;
}

/** URL usada pelo cliente Supabase no browser (same-origin em produção via proxy Vercel: /rest/v1, /auth/v1, /storage/v1). */
export function getSupabaseClientUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!isLocal) {
      return window.location.origin;
    }
  }
  return getSupabaseProjectUrl();
}
