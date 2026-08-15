import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/recuperar-senha")({
  head: () =>
    pageMeta({
      title: `Recuperar senha — ${STORE.name}`,
      description: `Redefina a senha da sua conta na ${STORE.name}.`,
      path: "/recuperar-senha",
      noindex: true,
    }),
  component: RecoverPage,
});

function RecoverPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="font-serif text-3xl font-bold">Recuperar senha</h1>
      {sent ? (
        <p className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm">
          Enviamos um link de recuperação para <strong>{email}</strong>. Verifique sua caixa de entrada.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Enviando..." : "Enviar link"}</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
      </p>
    </div>
  );
}
