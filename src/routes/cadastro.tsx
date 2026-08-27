import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isValidCPF, maskCPF, maskPhone, isAdultBirthDate } from "@/lib/validation";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/cadastro")({
  head: () =>
    pageMeta({
      title: `Criar conta — ${STORE.name}`,
      description: `Crie sua conta na ${STORE.name} para comprar vinhos com mais agilidade e acompanhar pedidos.`,
      path: "/cadastro",
      noindex: true,
    }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "", last_name: "", cpf: "", birth_date: "", phone: "", email: "", password: "",
  });
  const [loading, setLoading] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCPF(form.cpf)) return toast.error("CPF inválido");
    if (!isAdultBirthDate(form.birth_date)) {
      return toast.error("A venda de bebidas alcoólicas é proibida para menores de 18 anos");
    }
    if (form.password.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres");

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin + "/minha-conta",
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          cpf: form.cpf.replace(/\D/g, ""),
          birth_date: form.birth_date,
          phone: form.phone.replace(/\D/g, ""),
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada!");
    navigate({ to: data.session ? "/minha-conta" : "/login" });
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <h1 className="font-serif text-3xl font-bold">Criar conta</h1>
      <p className="mt-2 text-sm text-muted-foreground">Preencha os dados abaixo</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Nome</Label><Input required value={form.first_name} onChange={(e) => update("first_name", e.target.value)} /></div>
          <div><Label>Sobrenome</Label><Input required value={form.last_name} onChange={(e) => update("last_name", e.target.value)} /></div>
        </div>
        <div><Label>CPF</Label><Input required value={form.cpf} onChange={(e) => update("cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor="signup-birth">Data de nascimento</Label>
            <Input
              id="signup-birth"
              type="date"
              required
              value={form.birth_date}
              onChange={(e) => update("birth_date", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="relative z-0 min-w-0 max-w-full"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="signup-phone">Telefone</Label>
            <Input
              id="signup-phone"
              required
              value={form.phone}
              onChange={(e) => update("phone", maskPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className="relative z-0 min-w-0"
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
        </div>
        <div><Label>E-mail</Label><Input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
        <div><Label>Senha</Label><Input type="password" required minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Mínimo 8 caracteres" /></div>

        <Button type="submit" disabled={loading} className="w-full">{loading ? "Criando..." : "Criar conta"}</Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
      </p>
    </div>
  );
}
