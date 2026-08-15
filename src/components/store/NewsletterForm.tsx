import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { z } from "zod";
import { maskPhone } from "@/lib/validation";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  name: z.string().trim().min(1, "Informe seu nome").max(100),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
});

export function NewsletterForm({ title }: { title?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, name, phone });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone,
    });
    setLoading(false);
    if (error) {
      if ((error as { code?: string }).code === "23505") toast.info("Você já está inscrito!");
      else toast.error("Erro ao inscrever. Tente novamente.");
      return;
    }
    toast.success("Cadastro realizado! Bem-vindo(a) à lista VIP.");
    setEmail("");
    setName("");
    setPhone("");
  }

  const inputClass =
    "min-h-11 min-w-0 w-full border-0 bg-white px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-white/45";
  const heading = title?.trim() || "Assine nossa newsletter!";

  return (
    <section
      className="mt-8 bg-primary px-5 py-6 sm:px-8 lg:mt-10"
      aria-labelledby="footer-newsletter-title"
    >
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.6fr)]">
        <div className="flex items-center gap-3">
          <Mail
            className="h-7 w-7 shrink-0 text-primary-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          <div>
            <h3
              id="footer-newsletter-title"
              className="text-base font-bold leading-tight text-primary-foreground sm:text-lg"
            >
              {heading}
            </h3>
            <p className="mt-0.5 text-xs leading-snug text-primary-foreground/75">
              Receba ofertas e novidades.
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite o seu nome..."
            maxLength={100}
            className={inputClass}
            aria-label="Nome"
            autoComplete="name"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Digite o seu e-mail..."
            maxLength={255}
            className={inputClass}
            aria-label="E-mail"
            autoComplete="email"
          />
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            placeholder="Digite o seu telefone..."
            maxLength={20}
            className={inputClass}
            aria-label="Telefone"
            autoComplete="tel"
          />
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 bg-[#d6b36a] px-7 py-2.5 text-sm font-bold text-[#111111] hover:bg-[#e3c47f] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 xl:col-span-1"
          >
            {loading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Cadastrando" />
            ) : (
              "Cadastrar"
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
