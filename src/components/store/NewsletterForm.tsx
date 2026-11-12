import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
    "min-h-10 min-w-0 w-full rounded-md border-0 bg-white px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-white/40";
  const heading = title?.trim() || "Newsletter";

  return (
    <section
      className="bg-primary px-4 py-3 sm:px-5"
      aria-labelledby="footer-newsletter-title"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="shrink-0 lg:max-w-[220px]">
          <h3
            id="footer-newsletter-title"
            className="text-sm font-bold leading-tight text-primary-foreground sm:text-base"
          >
            {heading}
          </h3>
          <p className="mt-0.5 text-[11px] leading-snug text-primary-foreground/75">
            Receba ofertas e novidades.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
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
            className="min-h-10 bg-[#d6b36a] px-5 text-sm font-bold text-[#111111] transition hover:bg-[#e3c47f] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 xl:col-span-1"
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
