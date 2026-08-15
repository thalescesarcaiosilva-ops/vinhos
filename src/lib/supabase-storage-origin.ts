import { getSupabaseProjectUrl } from "./supabase-api-url";

/** Supabase project URL used for Storage assets (browser + SSR). */
export function getSupabaseStorageOrigin(): string {
  return getSupabaseProjectUrl();
}

/** Known Storage URL prefixes to normalize to site-relative /storage/... paths. */
export function getStorageHostPrefixes(): string[] {
  const hosts = new Set<string>([
    "https://galvaovinhos.com.br",
    "http://galvaovinhos.com.br",
    "https://www.galvaovinhos.com.br",
    "http://www.galvaovinhos.com.br",
    // Hosts legados (URLs antigas de imagem ainda no banco)
    "https://vinellevinhos.com.br",
    "http://vinellevinhos.com.br",
    "https://www.vinellevinhos.com.br",
    "http://www.vinellevinhos.com.br",
    "https://vinellevinhos.com",
    "http://vinellevinhos.com",
    "https://zsfhnjrotkbzyikkxmnm.supabase.co",
    "https://aufvvgytbrstsrfomngm.supabase.co",
  ]);

  try {
    hosts.add(getSupabaseProjectUrl());
  } catch {
    /* env not set (build scripts) */
  }

  return [...hosts];
}
