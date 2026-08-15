import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { Minus, Plus, Trash2, ShoppingBag, Truck, Tag, X, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { maskCEP, fetchAddressByCEP } from "@/lib/validation";
import { calcShipping, type ShippingQuote } from "@/lib/shipping";
import { validateCoupon } from "@/lib/coupon";
import { useStoreSettings } from "@/lib/store-settings";
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

function Cart() {
  const { items, setQty, remove, subtotal, count } = useCart();
  const { data: settings } = useStoreSettings();
  const navigate = useNavigate();

  const [zip, setZip] = useState("");
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [shippingIdx, setShippingIdx] = useState(0);
  const [cepLoading, setCepLoading] = useState(false);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // Hydrate from localStorage
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

  const shipping = quotes[shippingIdx]?.price ?? 0;
  const discount = coupon?.discount ?? 0;
  const total = useMemo(
    () => Math.max(0, subtotal - discount) + (quotes.length ? shipping : 0),
    [subtotal, discount, shipping, quotes.length],
  );

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-8 font-serif text-3xl font-bold text-primary md:text-4xl">Carrinho ({count})</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {items.map(it => (
            <div key={it.id} className="flex gap-4 rounded-sm border border-border bg-muted/50 p-4">
              {it.image && <img src={toSiteImageUrl(it.image)} alt={it.name} className="h-28 w-24 object-contain" />}
              <div className="flex flex-1 flex-col">
                <Link to="/produto/$slug" params={{ slug: it.slug }} className="text-sm font-medium hover:text-primary">{it.name}</Link>
                <div className="mt-1 text-sm font-bold text-[color:var(--buy)]">{brl(it.price)}</div>
                <div className="mt-auto flex items-center justify-between">
                  <div className="inline-flex items-center rounded-sm border border-border bg-background">
                    <button onClick={() => setQty(it.id, it.quantity - 1)} className="px-2 py-1"><Minus className="h-3 w-3" /></button>
                    <span className="w-8 text-center text-sm">{it.quantity}</span>
                    <button onClick={() => setQty(it.id, it.quantity + 1)} className="px-2 py-1"><Plus className="h-3 w-3" /></button>
                  </div>
                  <button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-right font-serif text-lg font-bold text-[color:var(--buy)]">{brl(it.price * it.quantity)}</div>
            </div>
          ))}

          {/* Calcular frete */}
          <div className="rounded-sm border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Calcular frete</h3>
            </div>
            <div className="flex gap-2">
              <input
                value={zip}
                onChange={e => setZip(maskCEP(e.target.value))}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => computeShipping(zip)}
                disabled={cepLoading || zip.replace(/\D/g, "").length !== 8}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Calcular"}
              </button>
            </div>
            {quotes.length > 0 && (
              <div className="mt-3 space-y-2">
                {quotes.map((q, i) => (
                  <label key={q.label} className={`flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm transition ${shippingIdx === i ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40"}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" checked={shippingIdx === i} onChange={() => setShippingIdx(i)} className="accent-primary" />
                      <span>{q.label}{q.eta ? ` · ${q.eta}` : ""}</span>
                    </span>
                    <span className="font-semibold text-foreground">{q.price === 0 ? <span className="text-primary">Grátis</span> : brl(q.price)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Cupom */}
          <div className="rounded-sm border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Cupom de desconto</h3>
            </div>
            {coupon ? (
              <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-primary">
                  <Tag className="h-4 w-4" /> {coupon.code} — desconto de {brl(coupon.discount)}
                </span>
                <button type="button" onClick={removeCoupon} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={e => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Insira o código"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponLoading || !couponInput}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="h-fit rounded-sm border border-border bg-cream p-6">
          <h3 className="mb-4 font-serif text-xl font-bold text-primary">Resumo</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-primary"><span>Cupom</span><span>−{brl(discount)}</span></div>
            )}
            <div className="flex justify-between">
              <span>Frete</span>
              <span className="text-muted-foreground">
                {quotes.length === 0 ? "calcule acima" : shipping === 0 ? "Grátis" : brl(shipping)}
              </span>
            </div>
            <div className="mt-3 flex justify-between border-t border-border pt-3 font-serif text-xl font-bold text-[color:var(--buy)]">
              <span>Total</span><span>{brl(total)}</span>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/checkout" })}
            className="mt-5 w-full rounded-sm bg-[color:var(--buy)] px-4 py-3 text-sm font-bold uppercase tracking-wider text-[color:var(--buy-foreground)] hover:brightness-110"
          >
            Finalizar compra
          </button>
          <Link
            to="/"
            className="mt-3 block w-full rounded-sm bg-muted px-4 py-3 text-center text-sm font-bold uppercase tracking-wider text-foreground transition hover:bg-muted/70"
          >
            Continuar comprando
          </Link>
        </aside>
      </div>
    </div>
  );
}
