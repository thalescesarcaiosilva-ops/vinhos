import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

function resolveNextPath(next: string) {
  if (!next) return "/minha-conta";
  if (next.startsWith("/")) return next;
  try {
    const url = new URL(next);
    if (url.hostname.includes("galvaovinhos.com")) {
      return `${url.pathname}${url.search}` || "/minha-conta";
    }
  } catch {
    /* ignore */
  }
  return "/minha-conta";
}

export const Route = createFileRoute("/auth/confirm")({
  head: () =>
    pageMeta({
      title: `Confirmando e-mail — ${STORE.name}`,
      description: `Confirmando seu e-mail na ${STORE.name}.`,
      path: "/auth/confirm",
      noindex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    token_hash: typeof search.token_hash === "string" ? search.token_hash : "",
    type: typeof search.type === "string" ? search.type : "email",
    next: typeof search.next === "string" ? search.next : "/minha-conta",
  }),
  component: AuthConfirmPage,
});

function AuthConfirmPage() {
  const navigate = useNavigate();
  const { token_hash, type, next } = Route.useSearch();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Confirmando seu e-mail…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token_hash) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Link de confirmação inválido ou incompleto.");
        }
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: (type || "email") as EmailOtpType,
      });

      if (cancelled) return;

      if (error) {
        setStatus("error");
        setMessage(error.message || "Não foi possível confirmar o e-mail. O link pode ter expirado.");
        return;
      }

      setStatus("ok");
      setMessage("E-mail confirmado! Redirecionando…");
      const dest = resolveNextPath(next);
      window.setTimeout(() => {
        void navigate({ to: dest, replace: true });
      }, 800);
    })();

    return () => {
      cancelled = true;
    };
  }, [token_hash, type, next, navigate]);

  return (
    <div className="container mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-serif text-2xl font-bold text-primary">
        {status === "error" ? "Confirmação falhou" : "Confirmação de e-mail"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      {status === "error" && (
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/login" className="rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
            Ir para o login
          </Link>
          <Link to="/cadastro" className="text-sm text-primary hover:underline">
            Criar conta novamente
          </Link>
        </div>
      )}
    </div>
  );
}
