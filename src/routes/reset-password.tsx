import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/reset-password")({
  head: () =>
    pageMeta({
      title: `Nova senha — ${STORE.name}`,
      description: `Defina uma nova senha para acessar sua conta na ${STORE.name}.`,
      path: "/reset-password",
      noindex: true,
    }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Mínimo 8 caracteres");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    navigate({ to: "/minha-conta" });
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="font-serif text-3xl font-bold">Definir nova senha</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><Label>Nova senha</Label><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" disabled={loading} className="w-full">{loading ? "Atualizando..." : "Atualizar senha"}</Button>
      </form>
    </div>
  );
}
