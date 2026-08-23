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
    "https://aufvvgytbrstsrfomngm.supabase.co",
    // Projetos Supabase legados — só para reescrever URLs antigas no banco até migrar
    "https://zsfhnjrotkbzyikkxmnm.supabase.co",
    "https://dymhoqxfamosdujzorrl.supabase.co",
  ]);

  try {
    hosts.add(getSupabaseProjectUrl());
  } catch {
    /* env not set (build scripts) */
  }

  return [...hosts];
}
