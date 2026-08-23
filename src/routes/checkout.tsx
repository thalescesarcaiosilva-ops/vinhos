import { useAuth } from "@/lib/auth";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Tag, X, Copy, Loader2, CreditCard, QrCode, Pencil, Check, ShieldCheck, ArrowLeft } from "lucide-react";
import { maskCEP, maskPhone, maskCPF, fetchAddressByCEP } from "@/lib/validation";
import { calcShipping, type ShippingQuote } from "@/lib/shipping";
import { validateCoupon } from "@/lib/coupon";
import { useStoreSettings, installmentPlan } from "@/lib/store-settings";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutPix, createCheckoutCard, getPayoutStatus } from "@/lib/payoutbr.functions";
import { PayoutCardForm, type PayoutCardHandle } from "@/components/store/PayoutCardForm";
import { GoogleAdsConversion } from "@/components/store/GoogleAdsConversion";
import { PixReceiptUpload } from "@/components/store/PixReceiptUpload";
import { CheckoutLegalConsent, CheckoutPolicyLinks } from "@/components/store/CheckoutLegalConsent";
import QRCode from "qrcode";
import { toSiteImageUrl } from "@/lib/image-url";
import { STORE } from "@/lib/settings";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/checkout")({
  head: () =>
    pageMeta({
      title: `Checkout — ${STORE.name}`,
      description: `Finalize sua compra na ${STORE.name} com Pix ou cartão. Frete para todo o Brasil.`,
      path: "/checkout",
      noindex: true,
    }),
  component: Checkout,
});

// Mensagem amigável para recusas de cartão a partir do refusedReason da PayoutBR.
function cardDeclineMessage(reason?: string | null): string {
  const fallback = "Pagamento não autorizado. Verifique os dados do cartão ou tente outro cartão.";
  if (!reason) return fallback;
  const r = reason.toLowerCase();
  if (r.includes("insufficient") || r.includes("saldo") || r.includes("limit")) return "Pagamento não autorizado. Cartão sem saldo/limite disponível.";
  if (r.includes("cvv") || r.includes("cvc") || r.includes("security")) return "Pagamento não autorizado. Código de segurança (CVV) inválido.";
  if (r.includes("expired") || r.includes("expir")) return "Pagamento não autorizado. Cartão expirado.";
  // A PayoutBR já retorna descrições em pt-BR — se for uma frase legível, usa direto.
  if (/[a-zà-ú]/i.test(reason) && reason.trim().length > 12) return reason.trim();
  return fallback;
}



function Checkout() {
  const { items, subtotal, clear, count } = useCart();
  const { data: settings } = useStoreSettings();
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<{
    orderId: string;
    orderNumber: string;
    qrCode: string | null;
    qrImage: string | null;
    expiresAt: string | null;
    receiptToken: string | null;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ orderId: string; order_number: string; total: number } | null>(null);
  const [method, setMethod] = useState<"pix" | "credit_card">("pix");
  const [installments, setInstallments] = useState(1);
  const cardHandleRef = useRef<PayoutCardHandle | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);

  // Stepper
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", doc: "",
    zip: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
    notes: "",
  });
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [shippingIdx, setShippingIdx] = useState(0);
  const [cepLoading, setCepLoading] = useState(false);

  // Prefill e-mail/nome da conta logada (ajuda a vincular o pedido em Meus Pedidos)
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      email: f.email || user.email || "",
      name: f.name || (user.user_metadata?.full_name as string | undefined) || (user.user_metadata?.name as string | undefined) || "",
    }));
  }, [user]);

  // Cupom
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);

  const payments = settings?.payments;
  const pixEnabled = payments?.pixEnabled ?? true;
  const cardEnabled = payments?.cardEnabled ?? true;
  const pixDiscountPct = (payments?.pixDiscount ?? 10) / 100;

  const shipping = quotes[shippingIdx]?.price ?? 0;
  const discount = coupon?.discount ?? 0;
  const pixDiscount = method === "pix" && pixEnabled
    ? Math.round((subtotal - discount) * pixDiscountPct * 100) / 100
    : 0;
  const total = useMemo(
    () => Math.max(0, subtotal - discount - pixDiscount) + shipping,
    [subtotal, discount, pixDiscount, shipping],
  );

  // Plano de parcelas a partir do painel admin (baseado no total cobrado no cartão)
  const cardPrice = Math.max(0, subtotal - discount) + shipping;
  const plan = useMemo(
    () => (payments ? installmentPlan(cardPrice, payments) : []),
    [cardPrice, payments],
  );
  const selectedPlan = plan.find((p) => p.n === installments) ?? plan[0];
  const cardTotal = selectedPlan?.total ?? cardPrice;



  // Se o método selecionado ficou desativado, ajusta
  useEffect(() => {
    if (method === "pix" && !pixEnabled && cardEnabled) setMethod("credit_card");
    if (method === "credit_card" && !cardEnabled && pixEnabled) setMethod("pix");
  }, [method, pixEnabled, cardEnabled]);

  useEffect(() => {
    if (plan.length > 0 && !plan.some((p) => p.n === installments)) {
      setInstallments(plan[0].n);
    }
  }, [plan, installments]);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const onZipBlur = async () => {
    const clean = form.zip.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const addr = await fetchAddressByCEP(form.zip);
      if (addr) {
        setForm(f => ({
          ...f,
          street: f.street || addr.street,
          neighborhood: f.neighborhood || addr.neighborhood,
          city: f.city || addr.city,
          state: f.state || addr.state,
        }));
      }
      const q = calcShipping(subtotal, form.zip, settings?.shipping, addr?.state);
      setQuotes(q);
      setShippingIdx(0);
    } catch {
      toast.error("Não foi possível buscar o CEP");
    } finally {
      setCepLoading(false);
    }
  }

  const applyCoupon = async () => {
    setCouponLoading(true);
    const res = await validateCoupon(couponInput, subtotal);
    setCouponLoading(false);
    if (res.ok) {
      setCoupon({ code: res.code, discount: res.discount });
      toast.success(`Cupom ${res.code} aplicado: -${brl(res.discount)}`);
    } else {
      toast.error(res.error);
    }
  }

  const createPix = useServerFn(createCheckoutPix);
  const createCard = useServerFn(createCheckoutCard);
  const pollStatus = useServerFn(getPayoutStatus);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (pix?.qrImage) {
        const img = pix.qrImage;
        if (!cancelled) {
          setQrDataUrl(
            img.startsWith("data:") || img.startsWith("http://") || img.startsWith("https://")
              ? img
              : `data:image/png;base64,${img}`,
          );
        }
        return;
      }
      if (!pix?.qrCode) {
        if (!cancelled) setQrDataUrl(null);
        return;
      }
      try {
        const url = await QRCode.toDataURL(pix.qrCode, { width: 320, margin: 1, errorCorrectionLevel: "M" });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pix?.qrCode, pix?.qrImage]);

  // Hydrate CEP + cupom vindos do carrinho
  useEffect(() => {
    try {
      const z = localStorage.getItem("checkout:zip");
      if (z && !form.zip) {
        setForm(f => ({ ...f, zip: z }));
        const clean = z.replace(/\D/g, "");
        if (clean.length === 8) {
          (async () => {
            try {
              const addr = await fetchAddressByCEP(z);
              if (addr) {
                setForm(f => ({
                  ...f,
                  street: f.street || addr.street,
                  neighborhood: f.neighborhood || addr.neighborhood,
                  city: f.city || addr.city,
                  state: f.state || addr.state,
                }));
              }
              const q = calcShipping(subtotal, z, settings?.shipping, addr?.state);
              setQuotes(q);
              setShippingIdx(0);
            } catch {}
          })();
        }
      }
      const c = localStorage.getItem("checkout:coupon");
      if (c && !coupon) {
        const parsed = JSON.parse(c);
        if (parsed?.code) {
          validateCoupon(parsed.code, subtotal).then(res => {
            if (res.ok) setCoupon({ code: res.code, discount: res.discount });
          });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.shipping]);


  useEffect(() => {
    if (!pix || paid) return;
    const id = setInterval(async () => {
      try {
        const res = await pollStatus({ data: { orderId: pix.orderId } });
        if (res.status === "confirmed") {
          setPaid({ orderId: pix.orderId, order_number: pix.orderNumber, total });
          clear();
        } else if (res.status === "cancelled") {
          toast.error("Pagamento cancelado ou expirado.");
          clearInterval(id);
        }
      } catch (e) { console.error(e); }
    }, 4000);
    return () => clearInterval(id);
  }, [pix, paid, pollStatus, clear]);

  if (paid) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <GoogleAdsConversion orderId={paid.orderId} value={paid.total} />
        <CheckCircle2 className="mx-auto h-20 w-20 text-[oklch(0.6_0.18_150)]" strokeWidth={1.5} />
        <h1 className="mt-6 font-serif text-3xl font-bold text-primary">Pagamento confirmado!</h1>
        <p className="mt-2 text-sm text-muted-foreground">Número do pedido</p>
        <p className="font-serif text-2xl font-bold text-foreground">#{paid.order_number}</p>
        <p className="mt-4 text-sm text-muted-foreground">Em breve enviaremos os detalhes por e-mail.</p>
        <Link to="/" className="mt-8 inline-block rounded-full bg-primary px-8 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
          Voltar à loja
        </Link>
      </div>
    );
  }

  if (pix) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <GoogleAdsConversion orderId={pix.orderId} value={total} />
        <h1 className="font-serif text-3xl font-bold text-primary">Pague com Pix</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pedido #{pix.orderNumber} · {brl(total)}</p>
        <div className="mx-auto mt-6 inline-block rounded-2xl border border-border bg-white p-4 shadow-sm">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code Pix" className="h-72 w-72" />
          ) : pix.qrCode ? (
            <div className="flex h-72 w-72 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <QrCode className="h-10 w-10 text-primary" />
              <p>Use o código Pix copia e cola abaixo para pagar.</p>
            </div>
          ) : (
            <div className="flex h-72 w-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          )}
        </div>
        {pix.qrCode && (
          <div className="mt-6 space-y-2 text-left">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pix copia e cola</label>
            <div className="flex gap-2">
              <input readOnly value={pix.qrCode} className="w-full rounded-full border border-border bg-card px-4 py-2 text-xs" />
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(pix.qrCode!); toast.success("Código copiado"); }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do pagamento...
        </p>
        {pix.expiresAt && (
          <p className="mt-2 text-xs text-muted-foreground">Expira em {new Date(pix.expiresAt).toLocaleString("pt-BR")}</p>
        )}
        <PixReceiptUpload orderId={pix.orderId} token={pix.receiptToken} />
      </div>
    );
  }

  if (count === 0) {
    return <div className="mx-auto max-w-2xl py-20 text-center">Carrinho vazio. <Link to="/" className="text-primary underline">Voltar à loja</Link></div>;
  }

  // Step gates
  const step1Valid = !!(form.name && /\S+@\S+/.test(form.email) && form.phone.replace(/\D/g, "").length >= 10);
  const step2Valid = step1Valid && !!(form.zip && form.street && form.number && form.neighborhood && form.city && form.state && quotes.length > 0);

  const goStep2 = () => {
    if (!step1Valid) { toast.error("Preencha nome, e-mail e telefone"); return; }
    setStep(2);
  };
  const goStep3 = () => {
    if (!step2Valid) { toast.error("Preencha o endereço completo"); return; }
    setStep(3);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalConsent) {
      toast.error("Marque que concorda com as políticas da loja para continuar");
      return;
    }
    if (!form.doc || form.doc.replace(/\D/g, "").length < 11) {
      toast.error("CPF é obrigatório para o pagamento");
      return;
    }
    const baseData = {
      customer: {
        name: form.name,
        email: (user?.email || form.email).trim().toLowerCase(),
        phone: form.phone || null,
        document: form.doc,
      },
      shippingAddress: {
        zip: form.zip, street: form.street, number: form.number,
        complement: form.complement, neighborhood: form.neighborhood,
        city: form.city, state: form.state,
      },
      items: items.map(i => ({
        productId: i.id,
        name: i.name,
        image: i.image,
        price: i.price,
        quantity: i.quantity,
      })),
      subtotal,
      shipping,
      discount: discount + pixDiscount,
      total: method === "credit_card" ? cardPrice : total,
      couponCode: coupon?.code ?? null,
      notes: form.notes || null,
    };

    setLoading(true);
    try {
      if (method === "pix") {
        const pixRes = await createPix({ data: baseData });
        setPix({
          orderId: pixRes.orderId,
          orderNumber: pixRes.orderNumber,
          qrCode: pixRes.qrCode,
          qrImage: pixRes.qrImage,
          expiresAt: pixRes.expiresAt,
          receiptToken: pixRes.receiptToken ?? null,
        });
      } else {
        if (!cardHandleRef.current?.valid) {
          toast.error("Preencha os dados do cartão");
          return;
        }
        const res = await cardHandleRef.current.submit(async (token) => {
          return createCard({ data: { ...baseData, token, installments } });
        });
        if (res.status === "confirmed") {
          setPaid({ orderId: res.orderId, order_number: res.orderNumber, total: cardPrice });
          clear();
        } else if (res.status === "cancelled") {
          toast.error(cardDeclineMessage(res.refusedReason));
        } else {
          toast.message("Pagamento em processamento. Aguarde a confirmação por e-mail.");
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar pagamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
  const btnPrimary = "w-full rounded-md bg-[color:var(--buy)] py-3.5 text-sm font-semibold uppercase tracking-wider text-[color:var(--buy-foreground)] transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.003_70)]">
      {/* Top bar: voltar | pagamento seguro | logo */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>

          <div className="flex items-center gap-2 text-sm font-semibold text-foreground shrink-0">
          <img
              src="/assets/favicon.png"
              alt={`Logo ${STORE.name}`}
              className="h-10 w-auto object-contain"
            />
          </div>

          
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
        <div className="mb-8">
          <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">Finalizar compra</h1>
          <p className="mt-1 text-sm text-muted-foreground">Complete as três etapas para concluir seu pedido.</p>
        </div>
        <TopStepper current={step} onJump={(s) => {
          if (s === 1) setStep(1);
          if (s === 2 && step1Valid) setStep(2);
          if (s === 3 && step2Valid) setStep(3);
        }} step1Valid={step1Valid} step2Valid={step2Valid} />
        <CheckoutPolicyLinks />
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-5">
            {/* STEP 1 — Identificação */}
            <StepCard n={1} title="Identificação" subtitle="Preencha seus dados para envio do pedido." active={step === 1} done={step > 1} onEdit={() => setStep(1)}>
              {step === 1 ? (
                <div className="space-y-4">
                  <Field label="Nome completo">
                    <input required value={form.name} onChange={upd("name")} placeholder="Ex.: Maria da Silva" className={inp} />
                  </Field>
                  <Field label="E-mail">
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={upd("email")}
                      placeholder="Ex.: maria@email.com"
                      className={inp}
                      readOnly={Boolean(user?.email)}
                      autoComplete="email"
                    />
                    {user?.email ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Pedido vinculado à sua conta ({user.email}).
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Sem conta? Sem problema — use este e-mail e, ao criar ou entrar depois, seus pedidos aparecem em Minha conta.
                      </p>
                    )}
                  </Field>
                  <Field label="Celular">
                    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                      <span className="text-base">🇧🇷</span>
                      <span className="text-sm text-muted-foreground">+55</span>
                      <input
                        required
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))}
                        placeholder="(11) 96123-4567"
                        className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
                      />
                    </div>
                  </Field>

                  {pixEnabled && (payments?.pixDiscount ?? 0) > 0 && (
                    <div className="flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                      <QrCode className="h-5 w-5 shrink-0 text-primary" />
                      <span className="text-foreground">Você ganha <strong className="text-primary">{payments?.pixDiscount}% de desconto</strong> pagando com Pix</span>
                    </div>
                  )}

                  <button type="button" onClick={goStep2} className={btnPrimary}>
                    Continuar para Entrega
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{form.name} · {form.email}</p>
              )}
            </StepCard>

            {/* STEP 2 — Entrega */}
            <StepCard
              n={2}
              title="Entrega"
              subtitle={step < 2 ? "Para calcular o frete é necessário preencher todos os campos acima." : "Informe o endereço de entrega."}
              active={step === 2}
              done={step > 2}
              disabled={step < 2}
              onEdit={() => setStep(2)}
            >
              {step === 2 && (
                <div className="space-y-4">
                  <Field label="CEP">
                    <input
                      required
                      value={form.zip}
                      onChange={e => setForm(f => ({ ...f, zip: maskCEP(e.target.value) }))}
                      onBlur={onZipBlur}
                      placeholder="00000-000"
                      className={inp}
                    />
                    {cepLoading && <span className="mt-1 block text-xs text-muted-foreground">Buscando endereço...</span>}
                  </Field>
                  <Field label="Rua">
                    <input required value={form.street} onChange={upd("street")} placeholder="Rua, Avenida, etc." className={inp} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Número"><input required value={form.number} onChange={upd("number")} placeholder="123" className={inp} /></Field>
                    <Field label="Complemento"><input value={form.complement} onChange={upd("complement")} placeholder="Apto, Bloco, etc." className={inp} /></Field>
                  </div>
                  <Field label="Bairro"><input required value={form.neighborhood} onChange={upd("neighborhood")} placeholder="Seu bairro" className={inp} /></Field>
                  <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="Cidade"><input required value={form.city} onChange={upd("city")} className={inp} /></Field>
                    <Field label="Estado"><input required maxLength={2} value={form.state} onChange={upd("state")} className={`${inp} uppercase`} /></Field>
                  </div>

                  {quotes.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Forma de entrega</p>
                      {quotes.map((q, i) => (
                        <label key={q.label} className={`flex cursor-pointer items-center justify-between rounded-md border p-3.5 text-sm transition ${shippingIdx === i ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}>
                          <span className="flex items-center gap-3">
                            <RadioDot checked={shippingIdx === i} />
                            <span>
                              <strong className="block text-foreground">{q.label}</strong>
                              <span className="text-xs text-muted-foreground">{q.eta}</span>
                            </span>
                          </span>
                          <span className="font-semibold text-foreground">{q.price === 0 ? <span className="text-primary">Grátis</span> : brl(q.price)}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={goStep3} className={btnPrimary} disabled={!step2Valid}>
                    Continuar para Pagamento
                  </button>
                  <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
                    Confira atentamente seus dados — o endereço de entrega não pode ser alterado após o envio do pedido.
                  </p>
                </div>
              )}
              {step > 2 && (
                <p className="text-sm text-muted-foreground">{form.street}, {form.number} — {form.city}/{form.state} · CEP {form.zip}</p>
              )}
            </StepCard>

            {/* STEP 3 — Pagamento */}
            <StepCard
              n={3}
              title="Pagamento"
              subtitle="Para finalizar seu pedido escolha uma forma de pagamento"
              active={step === 3}
              done={false}
              disabled={step < 3}
            >
              {step === 3 && (
                <div className="space-y-3">
                  {/* Cartão */}
                  {cardEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMethod("credit_card")}
                        className={`flex w-full items-center justify-between rounded-md border p-4 text-left transition ${method === "credit_card" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                      >
                        <span className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-foreground" />
                          <span className="font-semibold text-foreground">Cartão de Crédito</span>
                          {plan.length > 0 && (
                            <span className="hidden sm:inline text-xs text-muted-foreground">em até {plan[plan.length - 1].n}x</span>
                          )}
                        </span>
                        <RadioDot checked={method === "credit_card"} />
                      </button>

                      {method === "credit_card" && (
                        <div className="space-y-4 rounded-md border border-border bg-muted/30 p-5">
                          <Field label="CPF/CNPJ">
                            <input required value={form.doc} onChange={e => setForm(f => ({ ...f, doc: maskCPF(e.target.value) }))} placeholder="000.000.000-00" className={inp} />
                          </Field>
                          <PayoutCardForm
                            installments={installments}
                            setInstallments={setInstallments}
                            maxInstallments={payments?.maxInstallments ?? 6}
                            plan={plan}
                            onReadyChange={setCardReady}
                            onValidChange={setCardValid}
                            registerHandle={(h) => { cardHandleRef.current = h; }}
                          />
                          <CheckoutLegalConsent checked={legalConsent} onChange={setLegalConsent} />
                          <button
                            type="submit"
                            disabled={loading || !cardReady || !cardValid || !legalConsent}
                            className={btnPrimary}
                          >
                            {loading ? "Processando pagamento..." : `Pagar ${brl(cardPrice)}`}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Pix */}
                  {pixEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMethod("pix")}
                        className={`flex w-full items-center justify-between rounded-md border p-4 text-left transition ${method === "pix" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}
                      >
                        <span className="flex items-center gap-3">
                          <QrCode className="h-5 w-5 text-primary" />
                          <span className="font-semibold text-foreground">Pix</span>
                          <span className="hidden gap-1 sm:flex">
                            <Pill>APROVAÇÃO IMEDIATA</Pill>
                            {(payments?.pixDiscount ?? 0) > 0 && <Pill>{payments?.pixDiscount}% OFF</Pill>}
                          </span>
                        </span>
                        <RadioDot checked={method === "pix"} />
                      </button>

                      {method === "pix" && (
                        <div className="space-y-4 rounded-md border border-border bg-muted/30 p-5">
                          <p className="text-sm text-muted-foreground">
                            A confirmação é realizada em poucos minutos. Utilize o aplicativo do seu banco para pagar.
                          </p>
                          <div className="flex items-baseline justify-between border-y border-border py-3">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor no Pix</span>
                            <span className="font-serif text-2xl font-bold text-[color:var(--buy)]">{brl(total)}</span>
                          </div>
                          <Field label="CPF/CNPJ">
                            <input required value={form.doc} onChange={e => setForm(f => ({ ...f, doc: maskCPF(e.target.value) }))} placeholder="000.000.000-00" className={inp} />
                          </Field>
                          <CheckoutLegalConsent checked={legalConsent} onChange={setLegalConsent} />
                          <button
                            type="submit"
                            disabled={loading || !legalConsent}
                            className={btnPrimary}
                          >
                            {loading ? "Gerando Pix..." : `Pagar ${brl(total)}`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </StepCard>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-2 pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Conexão segura SSL
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Dados protegidos
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-primary" />
                Pagamento criptografado
              </span>
            </div>
          </div>

          {/* Resumo */}
          <aside className="h-fit lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/40 px-5 py-3.5">
                <h3 className="font-serif text-base font-bold uppercase tracking-wider text-foreground">Resumo do pedido</h3>
              </div>

              <div className="space-y-4 p-5">
                <div className="space-y-3">
                  {items.map(i => (
                    <div key={i.id} className="flex items-start gap-3 text-sm">
                      {i.image && (
                        <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
                          <img src={toSiteImageUrl(i.image)} alt="" className="h-full w-full object-contain p-1" />
                          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i.quantity}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-medium text-foreground">{i.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Qtd: {i.quantity}</div>
                      </div>
                      <div className="text-sm font-semibold text-foreground">{brl(i.price * i.quantity)}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-4">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cupom de desconto</label>
                  {coupon ? (
                    <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 font-semibold text-primary">
                        <Tag className="h-4 w-4" /> {coupon.code}
                      </span>
                      <button type="button" onClick={() => setCoupon(null)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center overflow-hidden rounded-md border border-input bg-background">
                      <Tag className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={couponInput}
                        onChange={e => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Insira o código"
                        className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput}
                        className="h-full bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground transition hover:bg-muted/70 disabled:opacity-50"
                      >
                        Aplicar
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="text-foreground">{brl(subtotal)}</span></div>
                  {discount > 0 && (
                    <div className="flex justify-between text-primary"><span>Cupom</span><span>−{brl(discount)}</span></div>
                  )}
                  {pixDiscount > 0 && (
                    <div className="flex justify-between text-primary"><span>Desconto Pix ({payments?.pixDiscount ?? 0}%)</span><span>−{brl(pixDiscount)}</span></div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Frete</span>
                    <div className="text-right">
                      <span className="block text-foreground">{quotes.length === 0 ? "—" : shipping === 0 ? "Grátis" : brl(shipping)}</span>
                      {quotes[shippingIdx]?.eta && (
                        <span className="block text-xs text-muted-foreground">{quotes[shippingIdx].eta}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-baseline justify-between border-t border-border pt-4">
                  <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Total</span>
                  <span className="font-serif text-2xl font-bold text-[color:var(--buy)]">
                    {brl(method === "credit_card" ? cardPrice : total)}
                  </span>
                </div>
                {method === "credit_card" && selectedPlan && (
                  <p className="text-right text-xs text-muted-foreground">
                    {selectedPlan.n}x de {brl(selectedPlan.value)}
                    {selectedPlan.hasInterest ? " com juros no cartão" : " sem juros"}
                  </p>
                )}
              </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}

function StepCard({
  n, title, subtitle, active, done, disabled, onEdit, children,
}: {
  n: number; title: string; subtitle?: string;
  active: boolean; done: boolean; disabled?: boolean;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  const muted = disabled && !active && !done;
  return (
    <section className={`overflow-hidden rounded-lg border bg-card transition ${active ? "border-primary/30 shadow-sm" : "border-border"}`}>
      <header className={`flex items-start justify-between gap-4 px-6 py-5 ${active ? "border-b border-border bg-muted/30" : ""}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-primary text-primary-foreground" : muted ? "bg-muted text-muted-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {done ? <Check className="h-4 w-4" /> : n}
          </div>
          <div>
            <h2 className={`font-serif text-base font-bold uppercase tracking-wider ${muted ? "text-muted-foreground" : "text-foreground"}`}>{title}</h2>
            {subtitle && active && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {done && onEdit && (
          <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </header>
      {(active || done) && (
        <div className="px-6 py-5">{children}</div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-primary" : "border-muted-foreground/40"}`}>
      {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{children}</span>;
}

function TopStepper({
  current, onJump, step1Valid, step2Valid,
}: {
  current: 1 | 2 | 3;
  onJump: (s: 1 | 2 | 3) => void;
  step1Valid: boolean;
  step2Valid: boolean;
}) {
  const steps: { n: 1 | 2 | 3; label: string; enabled: boolean }[] = [
    { n: 1, label: "Identificação", enabled: true },
    { n: 2, label: "Entrega", enabled: step1Valid },
    { n: 3, label: "Pagamento", enabled: step2Valid },
  ];
  return (
    <nav aria-label="Etapas do checkout" className="mb-6">
      <ol className="flex items-center justify-between gap-2 sm:gap-4">
        {steps.map((s, i) => {
          const isActive = current === s.n;
          const isDone = current > s.n;
          const reachable = s.enabled;
          return (
            <li key={s.n} className="flex flex-1 items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => reachable && onJump(s.n)}
                disabled={!reachable}
                className="flex min-w-0 items-center gap-2 sm:gap-3 text-left disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    isDone
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-card text-muted-foreground border border-border"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span
                  className={`truncate text-xs sm:text-sm font-semibold ${
                    isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={`h-0.5 flex-1 rounded-full transition ${
                    current > s.n ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
