import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/login")({
  head: () =>
    pageMeta({
      title: `Entrar — ${STORE.name}`,
      description: `Acesse sua conta na ${STORE.name} para ver pedidos, favoritos e endereços salvos.`,
      path: "/login",
      noindex: true,
    }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/minha-conta", replace: true });
  }, [user, navigate]);

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/minha-conta" });
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-foreground">Entrar</h1>
      <p className="mt-2 text-sm text-muted-foreground">Acesse sua conta para continuar</p>

      <form onSubmit={handleEmailLogin} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-center text-sm">
        <Link to="/recuperar-senha" className="text-primary hover:underline">Esqueci minha senha</Link>
        <p className="text-muted-foreground">
          Não tem conta? <Link to="/cadastro" className="text-primary hover:underline">Cadastre-se</Link>
        </p>
      </div>
    </div>
  );
}
