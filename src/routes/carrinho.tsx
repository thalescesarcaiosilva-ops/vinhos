import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import {
  ChevronsRight,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { maskCEP, fetchAddressByCEP } from "@/lib/validation";
import { calcShipping, type ShippingQuote } from "@/lib/shipping";
import { validateCoupon } from "@/lib/coupon";
import { DEFAULT_SETTINGS, useStoreSettings } from "@/lib/store-settings";
import { toast } from "sonner";
import { toSiteImageUrl } from "@/lib/image-url";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";
export const Route = createFileRoute("/carrinho")({
  head: () =>
    pageMeta({
      title: `Carrinho — ${STORE.name}`,
      description: `Revise os vinhos no seu carrinho na ${STORE.name} e finalize a compra com frete para todo o Brasil.`,
      path: "/carrinho",
      noindex: true,
    }),
  component: Cart,
});

function CartStepper({ className = "" }: { className?: string }) {
  const steps = [
    { n: 1, label: "Carrinho", active: true },
    { n: 2, label: "Finalizar", active: false },
  ];
  return (
    <nav aria-label="Etapas da compra" className={className}>
      <ol className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
        {steps.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 sm:gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                  s.active ? "border-primary text-primary" : "border-primary/30 text-primary/40"
                }`}
              >
                {s.n}
              </span>
              <span
                className={`text-xs sm:text-sm ${s.active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {s.label}
              </span>
            </span>
            {i < steps.length - 1 && (
              <ChevronsRight className="h-4 w-4 text-muted-foreground/60" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Cart() {
  const { items, setQty, remove, subtotal, count } = useCart();
  const { data: settings } = useStoreSettings();
  const navigate = useNavigate();
  const pay = settings?.payments ?? DEFAULT_SETTINGS.payments;

  const [zip, setZip] = useState("");
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [shippingIdx, setShippingIdx] = useState(0);
  const [cepLoading, setCepLoading] = useState(false);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    try {
      const z = localStorage.getItem("checkout:zip");
      if (z) setZip(z);
      const c = localStorage.getItem("checkout:coupon");
      if (c) {
        const parsed = JSON.parse(c);
        if (parsed?.code) setCouponInput(parsed.code);
      }
    } catch {}
  }, []);

  const computeShipping = async (cepValue: string) => {
    const clean = cepValue.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const addr = await fetchAddressByCEP(cepValue);
      const q = calcShipping(subtotal, cepValue, settings?.shipping, addr?.state);
      setQuotes(q);
      setShippingIdx(0);
      try { localStorage.setItem("checkout:zip", cepValue); } catch {}
    } catch {
      toast.error("Não foi possível calcular o frete");
    } finally {
      setCepLoading(false);
    }
  };

  useEffect(() => {
    if (zip.replace(/\D/g, "").length === 8) {
      computeShipping(zip);
    } else {
      setQuotes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip, subtotal, settings?.shipping]);

  const applyCoupon = async () => {
    setCouponLoading(true);
    const res = await validateCoupon(couponInput, subtotal);
    setCouponLoading(false);
    if (res.ok) {
      setCoupon({ code: res.code, discount: res.discount });
      try { localStorage.setItem("checkout:coupon", JSON.stringify({ code: res.code })); } catch {}
      toast.success(`Cupom ${res.code} aplicado: -${brl(res.discount)}`);
    } else {
      toast.error(res.error);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    try { localStorage.removeItem("checkout:coupon"); } catch {}
  };

  const shipping = quotes.length ? (quotes[shippingIdx]?.price ?? 0) : 0;
  const discount = coupon?.discount ?? 0;
  const productsNet = Math.max(0, subtotal - discount);
  const pixPct = pay.pixEnabled ? pay.pixDiscount || 0 : 0;
  const orderTotal = productsNet + (quotes.length ? shipping : 0);

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground" strokeWidth={1} />
        <h1 className="mt-4 font-serif text-3xl font-bold text-primary">Seu carrinho está vazio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Que tal explorar nossa coleção de vinhos?</p>
        <Link to="/" className="mt-6 inline-block rounded-sm bg-[color:var(--buy)] px-6 py-3 text-sm font-bold uppercase tracking-wider text-[color:var(--buy-foreground)] hover:brightness-110">
          Continuar comprando
        </Link>
      </div>
    );
  }

  const inputCls =
    "h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base sm:text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
  const sideBtnCls =
    "h-10 shrink-0 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50";

  return (
    <div className="bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:py-10">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShoppingCart className="h-5 w-5" aria-hidden /> Carrinho ({count})
          </h1>
          <CartStepper />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
          <div className="min-w-0">
            <h2 className="mb-3 hidden items-center gap-2 text-lg font-medium text-foreground lg:flex">
              <ShoppingCart className="h-5 w-5" aria-hidden /> Carrinho de Compras
            </h2>

            <div className="rounded-lg bg-card p-4 shadow-sm sm:p-5">
              <div className="hidden grid-cols-[96px_minmax(0,1fr)_120px_130px] gap-4 pb-2 text-xs text-muted-foreground sm:grid">
                <span />
                <span>Produto</span>
                <span className="text-center">Quantidade</span>
                <span className="text-right">Valor</span>
              </div>

              <ul className="divide-y divide-border">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 first:pt-2 last:pb-1 sm:grid-cols-[96px_minmax(0,1fr)_120px_130px] sm:items-center sm:gap-4"
                  >
                    <div className="row-span-2 flex h-20 items-center justify-center sm:row-span-1 sm:h-24">
                      {it.image && (
                        <img
                          src={toSiteImageUrl(it.image)}
                          alt={it.name}
                          className="max-h-full w-full object-contain"
                        />
                      )}
                    </div>

                    <Link
                      to="/produto/$slug"
                      params={{ slug: it.slug }}
                      className="line-clamp-3 text-sm text-foreground hover:text-primary"
                    >
                      {it.name}
                    </Link>

                    <div className="flex items-center justify-between gap-3 sm:contents">
                      <div className="flex items-center gap-3 sm:flex-col sm:gap-1.5">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(it.id, it.quantity - 1)}
                            disabled={it.quantity <= 1}
                            aria-label="Diminuir quantidade"
                            className="flex h-7 w-7 items-center justify-center rounded bg-muted text-foreground transition hover:bg-muted/70 disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm" aria-live="polite">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(it.id, it.quantity + 1)}
                            aria-label="Aumentar quantidade"
                            className="flex h-7 w-7 items-center justify-center rounded bg-muted text-foreground transition hover:bg-muted/70"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(it.id)}
                          aria-label={`Remover ${it.name}`}
                          className="text-destructive/80 transition hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-semibold text-[color:var(--buy)]">
                          {brl(it.price * it.quantity * (1 - pixPct / 100))}
                        </div>
                        {pay.pixEnabled && (
                          <div className="text-xs text-muted-foreground">no Pix</div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              to="/"
              className="mt-4 inline-block rounded-md bg-card px-4 py-2.5 text-sm text-foreground shadow-sm transition hover:text-primary"
            >
              Voltar às compras
            </Link>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-6 lg:h-fit">
            <CartStepper className="mb-4 hidden justify-end lg:flex" />
            <h2 className="mb-3 flex items-center gap-2 text-lg font-medium text-foreground">
              <ShoppingBag className="h-5 w-5" aria-hidden /> Resumo da compra
            </h2>

            <div className="rounded-lg bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
                <span className="text-foreground">Produtos</span>
                <span className="font-semibold text-foreground">{brl(subtotal)}</span>
              </div>

              <div className="border-b border-border py-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-foreground">Frete e prazo:</span>
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Não sei meu CEP
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    value={zip}
                    onChange={(e) => setZip(maskCEP(e.target.value))}
                    placeholder="00000-000"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={9}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => computeShipping(zip)}
                    disabled={cepLoading || zip.replace(/\D/g, "").length !== 8}
                    className={`${sideBtnCls} w-16`}
                  >
                    {cepLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "OK"}
                  </button>
                </div>
                {quotes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {quotes.map((q, i) => (
                      <label
                        key={q.label}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition ${
                          shippingIdx === i ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="radio"
                            checked={shippingIdx === i}
                            onChange={() => setShippingIdx(i)}
                            className="accent-primary"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{q.label}</span>
                            {q.eta && <span className="block text-xs text-muted-foreground">{q.eta} após o envio</span>}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold">
                          {q.price === 0 ? <span className="text-[color:var(--buy)]">Grátis</span> : brl(q.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-b border-border py-4">
                <p className="mb-2 text-sm text-foreground">Cupom de desconto:</p>
                {coupon ? (
                  <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-primary">
                      <Tag className="h-4 w-4" /> {coupon.code} · −{brl(coupon.discount)}
                    </span>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      aria-label="Remover cupom"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Código do Cupom"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponInput}
                      className={sideBtnCls}
                    >
                      {couponLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Aplicar"}
                    </button>
                  </div>
                )}
              </div>

              <dl className="space-y-2.5 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-medium text-foreground">{brl(productsNet)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Frete</dt>
                  <dd className="font-medium text-foreground">
                    {quotes.length === 0 ? "A calcular" : shipping === 0 ? "Grátis" : brl(shipping)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="text-lg font-bold text-[color:var(--buy)]">{brl(orderTotal)}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => navigate({ to: "/checkout" })}
                className="mt-4 h-12 w-full rounded-md bg-[color:var(--buy)] text-sm font-semibold text-[color:var(--buy-foreground)] transition hover:brightness-110"
              >
                Finalizar compra
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
