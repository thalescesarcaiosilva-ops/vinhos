/**
 * Chaves sb_secret_ do Supabase não funcionam com @supabase/supabase-js para
 * PostgREST (retorna "Invalid API key"). O checkout precisa do JWT legacy (eyJ...).
 */
export function resolveSupabaseServiceRoleKey(): string {
  const legacy = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY?.trim();
  const primary = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (legacy?.startsWith("eyJ")) return legacy;
  if (primary?.startsWith("eyJ")) return primary;

  if (primary?.startsWith("sb_secret_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY está no formato sb_secret_, que não funciona para criar pedidos. " +
        "Adicione SUPABASE_LEGACY_SERVICE_ROLE_KEY na Vercel com a chave JWT legacy (eyJ...) " +
        "(Supabase Dashboard → Settings → API → Legacy API Keys → service_role) e faça redeploy.",
    );
  }

  if (!primary) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. On Vercel, add SUPABASE_LEGACY_SERVICE_ROLE_KEY " +
        "(JWT eyJ...) or SUPABASE_SERVICE_ROLE_KEY (JWT). Never use a VITE_ prefix.",
    );
  }

  return primary;
}
