import { createFileRoute } from "@tanstack/react-router";
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  CheckCircle2,
  Clock,
  Facebook,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { mailtoHref, telHref } from "@/lib/contact-links";
import { pageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fale-conosco")({
  head: () =>
    pageMeta({
      title: `Fale Conosco — ${STORE.name}`,
      description: `Fale com a ${STORE.name}: dúvidas sobre pedidos, vinhos, parcerias ou atendimento. E-mail ${STORE.email} · Tel. ${STORE.phone}.`,
      path: "/fale-conosco",
    }),
  component: ContactPage,
});

const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "O nome deve ter pelo menos 3 caracteres.")
    .max(100, "O nome deve ter no máximo 100 caracteres."),
  email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .max(100, "O e-mail deve ter no máximo 100 caracteres."),
  phone: z
    .string()
    .trim()
    .min(10, "Telefone inválido.")
    .max(20, "O telefone deve ter no máximo 20 caracteres.")
    .optional()
    .or(z.literal("")),
  subject: z
    .string()
    .trim()
    .min(3, "O assunto deve ter pelo menos 3 caracteres.")
    .max(150, "O assunto deve ter no máximo 150 caracteres."),
  message: z
    .string()
    .trim()
    .min(10, "A mensagem deve ter pelo menos 10 caracteres.")
    .max(2000, "A mensagem deve ter no máximo 2000 caracteres."),
});

type ContactFormInput = z.infer<typeof contactFormSchema>;

function ContactPage() {
  const { data: settings } = useStoreSettings();
  const [formData, setFormData] = useState<ContactFormInput>({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormInput, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const footer = settings?.footer;

  const address = footer?.address || "";
  const phone = footer?.phone || "";
  const email = footer?.email || "";
  const phoneLink = telHref(phone);
  const emailLink = mailtoHref(email);
  const instagram = footer?.instagramUrl || "";
  const facebook = footer?.facebookUrl || "";

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof ContactFormInput]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");
    setErrors({});

    try {
      const validatedData = contactFormSchema.parse(formData);

      const { error } = await supabase.from("contact_messages").insert([
        {
          name: validatedData.name,
          email: validatedData.email,
          phone: validatedData.phone || null,
          subject: validatedData.subject,
          message: validatedData.message,
        },
      ]);

      if (error) throw error;

      setIsSuccess(true);
      setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ContactFormInput, string>> = {};
        err.errors.forEach((error) => {
          const field = error.path[0];
          if (typeof field === "string" && field in formData) {
            fieldErrors[field as keyof ContactFormInput] = error.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        console.error("Erro ao enviar mensagem de contato:", err);
        setSubmitError(
          "Desculpe, ocorreu um erro ao enviar sua mensagem. Por favor, tente novamente mais tarde.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <header className="mb-12 max-w-3xl border-b border-border pb-8 md:mb-16 md:pb-10">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Atendimento
          </span>
          <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Fale Conosco
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Estamos aqui para ajudar. Se você tem alguma dúvida sobre um pedido, precisa de ajuda
            com uma seleção de vinhos ou quer falar sobre parcerias, entre em contato.
          </p>
        </header>

        <div className="grid gap-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-0">
          <aside className="lg:pr-14">
            <h2 className="font-serif text-xl font-bold text-foreground md:text-2xl">
              Canais de atendimento
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Fale diretamente com nossa equipe pelos canais oficiais.
            </p>

            <div className="mt-8 divide-y divide-border border-y border-border">
              {address && (
                <div className="flex gap-4 py-5">
                  <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Endereço</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{address}</p>
                  </div>
                </div>
              )}

              {phone && (
                <div className="flex gap-4 py-5">
                  <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Telefone</h3>
                    {phoneLink ? (
                      <a
                        href={phoneLink}
                        className="mt-1 inline-block text-sm text-muted-foreground hover:text-primary hover:underline"
                      >
                        {phone}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">{phone}</p>
                    )}
                  </div>
                </div>
              )}

              {email && (
                <div className="flex gap-4 py-5">
                  <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">E-mail</h3>
                    {emailLink ? (
                      <a
                        href={emailLink}
                        className="mt-1 inline-block break-all text-sm text-muted-foreground hover:text-primary hover:underline"
                      >
                        {email}
                      </a>
                    ) : (
                      <p className="mt-1 break-all text-sm text-muted-foreground">{email}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-4 py-5">
                <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Horário de funcionamento
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Segunda a Sexta-feira: 08:00h às 18:00h
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Exceto feriados</p>
                </div>
              </div>
            </div>

            {(instagram || facebook) && (
              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Siga-nos nas redes
                </h3>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  {instagram && (
                    <a
                      href={instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                    >
                      <Instagram className="h-4 w-4" aria-hidden="true" />
                      Instagram
                    </a>
                  )}
                  {facebook && (
                    <a
                      href={facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
                    >
                      <Facebook className="h-4 w-4" aria-hidden="true" />
                      Facebook
                    </a>
                  )}
                </div>
              </div>
            )}
          </aside>

          <section className="border-t border-border pt-10 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
            {isSuccess ? (
              <div className="py-8" role="status">
                <CheckCircle2 className="mb-5 h-8 w-8 text-primary" aria-hidden="true" />
                <h2 className="font-serif text-2xl font-bold text-foreground">Mensagem enviada</h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  Agradecemos seu contato. Sua mensagem foi recebida com sucesso e nossa equipe
                  responderá em breve, diretamente no e-mail informado.
                </p>
                <Button
                  type="button"
                  onClick={() => setIsSuccess(false)}
                  className="mt-8 rounded-sm shadow-none"
                >
                  Enviar nova mensagem
                </Button>
              </div>
            ) : (
              <>
                <h2 className="font-serif text-xl font-bold text-foreground md:text-2xl">
                  Envie uma mensagem
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Preencha os campos abaixo e responderemos o mais breve possível.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-6" aria-busy={isSubmitting}>
                  {submitError && (
                    <p
                      role="alert"
                      className="border-l-2 border-destructive pl-3 text-sm text-destructive"
                    >
                      {submitError}
                    </p>
                  )}

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Nome completo *</Label>
                      <Input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? "name-error" : undefined}
                        className={cn(
                          "h-11 rounded-sm bg-background shadow-none",
                          errors.name && "border-destructive",
                        )}
                        placeholder="Ex: João Silva"
                      />
                      {errors.name && (
                        <p id="name-error" className="text-xs font-medium text-destructive">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email">Seu e-mail *</Label>
                      <Input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? "email-error" : undefined}
                        className={cn(
                          "h-11 rounded-sm bg-background shadow-none",
                          errors.email && "border-destructive",
                        )}
                        placeholder="Ex: joao@email.com"
                      />
                      {errors.email && (
                        <p id="email-error" className="text-xs font-medium text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone / celular</Label>
                      <Input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.phone)}
                        aria-describedby={errors.phone ? "phone-error" : undefined}
                        className={cn(
                          "h-11 rounded-sm bg-background shadow-none",
                          errors.phone && "border-destructive",
                        )}
                        placeholder="Ex: (62) 99999-9999"
                      />
                      {errors.phone && (
                        <p id="phone-error" className="text-xs font-medium text-destructive">
                          {errors.phone}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="subject">Assunto *</Label>
                      <Input
                        type="text"
                        id="subject"
                        name="subject"
                        required
                        value={formData.subject}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.subject)}
                        aria-describedby={errors.subject ? "subject-error" : undefined}
                        className={cn(
                          "h-11 rounded-sm bg-background shadow-none",
                          errors.subject && "border-destructive",
                        )}
                        placeholder="Ex: Dúvida sobre entrega"
                      />
                      {errors.subject && (
                        <p id="subject-error" className="text-xs font-medium text-destructive">
                          {errors.subject}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="message">Mensagem *</Label>
                    <Textarea
                      id="message"
                      name="message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      aria-invalid={Boolean(errors.message)}
                      aria-describedby={errors.message ? "message-error" : undefined}
                      className={cn(
                        "min-h-36 resize-none rounded-sm bg-background shadow-none",
                        errors.message && "border-destructive",
                      )}
                      placeholder="Escreva sua dúvida, sugestão ou feedback aqui..."
                    />
                    {errors.message && (
                      <p id="message-error" className="text-xs font-medium text-destructive">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-sm px-6 shadow-none sm:w-auto"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send aria-hidden="true" />
                        Enviar mensagem
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
