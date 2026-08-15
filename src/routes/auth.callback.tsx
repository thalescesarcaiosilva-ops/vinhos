import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/auth/callback")({
  head: () =>
    pageMeta({
      title: `Autenticando… — ${STORE.name}`,
      description: `Concluindo autenticação na ${STORE.name}.`,
      path: "/auth/callback",
      noindex: true,
    }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/minha-conta", replace: true });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate({ to: "/minha-conta", replace: true });
    });

    const timeout = window.setTimeout(() => {
      navigate({ to: "/login", replace: true });
    }, 10_000);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-muted-foreground">Entrando na sua conta…</p>
    </div>
  );
}
