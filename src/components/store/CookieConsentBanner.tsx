import { Link, useRouterState } from "@tanstack/react-router";
import { useCookieConsent } from "@/lib/cookie-consent";
import { POLICY_SLUGS } from "@/lib/policy-links";

/**
 * Barra de cookies da vitrine.
 * Só cookies essenciais (carrinho, sessão) rodam sem aceite.
 * Analytics/ads/Clarity só após "Aceitar".
 */
export function CookieConsentBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPrivate =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/suporte") ||
    pathname.startsWith("/checkout");
  const { consent, ready, accept, reject } = useCookieConsent();

  if (!ready || isPrivate || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Preferências de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Usamos cookies essenciais para o funcionamento da loja e, com sua permissão, cookies de
          análise e marketing para melhorar a experiência.{" "}
          <Link
            to="/politicas/$slug"
            params={{ slug: POLICY_SLUGS.privacy }}
            className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
          >
            Política de Privacidade
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={reject}
            className="h-10 rounded-sm border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={accept}
            className="h-10 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
