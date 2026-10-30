import { Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, ShoppingBag, Truck, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { toSiteImageUrl } from "@/lib/image-url";
import { useStoreSettings } from "@/lib/store-settings";

export function CartDrawer() {
  const { items, setQty, remove, subtotal, count, drawerOpen, setDrawerOpen, closeDrawer } = useCart();
  const { data: settings } = useStoreSettings();
  const pixPercent = settings?.payments?.pixEnabled ? (settings.payments.pixDiscount ?? 0) : 0;
  const pixOff = pixPercent > 0 ? Math.round(subtotal * (pixPercent / 100) * 100) / 100 : 0;
  const pixTotal = Math.max(0, subtotal - pixOff);
  const freeFrom = settings?.shipping?.freeShippingFrom ?? 0;
  const hasFreeRule = freeFrom > 0;
  const freeShipping = hasFreeRule && subtotal >= freeFrom;
  const progress = !hasFreeRule ? 100 : Math.min(100, (subtotal / freeFrom) * 100);
  const missing = Math.max(0, freeFrom - subtotal);

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px] [&>button]:hidden"
      >
        <div className="flex items-center justify-between bg-primary px-4 py-3.5 text-primary-foreground">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold text-primary-foreground">
            Carrinho
            {count > 0 && (
              <span className="rounded-full bg-[#c6a35a] px-2 py-0.5 text-xs font-bold text-[#3a2418]">
                {count} {count === 1 ? "item" : "itens"}
              </span>
            )}
          </SheetTitle>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Fechar carrinho"
            className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground/90 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            <button
              type="button"
              onClick={closeDrawer}
              className="mt-2 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary"
            >
              Continuar comprando
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ul>
                {items.map((item) => {
                  const line = item.price * item.quantity;
                  const linePix = pixPercent > 0 ? line * (1 - pixPercent / 100) : line;
                  return (
                    <li key={item.id} className="relative border-b border-border px-4 py-4">
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        aria-label={`Remover ${item.name}`}
                        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="flex gap-3 pr-6">
                        <Link
                          to="/produto/$slug"
                          params={{ slug: item.slug }}
                          onClick={closeDrawer}
                          className="grid h-16 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/40"
                        >
                          {item.image && (
                            <img
                              src={toSiteImageUrl(item.image)}
                              alt=""
                              className="h-full w-full object-contain p-1"
                            />
                          )}
                        </Link>
                        <Link
                          to="/produto/$slug"
                          params={{ slug: item.slug }}
                          onClick={closeDrawer}
                          className="line-clamp-2 min-w-0 flex-1 pt-0.5 text-sm font-medium leading-snug text-foreground hover:text-primary"
                        >
                          {item.name}
                        </Link>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="inline-flex h-9 items-center rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => setQty(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-primary disabled:opacity-40"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQty(item.id, item.quantity + 1)}
                            className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-primary"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-right">
                          {pixPercent > 0 && (
                            <p className="text-xs text-muted-foreground line-through">{brl(line)}</p>
                          )}
                          <p className="text-lg font-bold leading-none text-foreground">{brl(linePix)}</p>
                          {pixPercent > 0 && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">no PIX</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-border bg-background px-4 pb-4 pt-3">
              {hasFreeRule && (
                <div className="mb-3">
                  <p className={`mb-1.5 text-center text-sm font-semibold ${freeShipping ? "text-buy" : "text-foreground"}`}>
                    {freeShipping
                      ? "Você ganhou frete grátis!"
                      : `Faltam ${brl(missing)} para frete grátis`}
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-buy" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <Truck className="h-4 w-4 text-primary" aria-hidden />
                  Entrega
                </span>
                <span className={freeShipping ? "font-semibold text-buy" : "text-muted-foreground"}>
                  {freeShipping ? "Grátis" : "Calculada no checkout"}
                </span>
              </div>

              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Subtotal ({count} {count === 1 ? "produto" : "produtos"})
                  </dt>
                  <dd>{brl(subtotal)}</dd>
                </div>
                {pixOff > 0 && (
                  <div className="flex justify-between text-buy">
                    <dt>Desconto no PIX</dt>
                    <dd>− {brl(pixOff)}</dd>
                  </div>
                )}
                <div className="flex items-end justify-between pt-1">
                  <dt className="font-semibold text-foreground">
                    {pixPercent > 0 ? "Total no PIX" : "Total"}
                  </dt>
                  <dd className="text-xl font-bold text-foreground">{brl(pixPercent > 0 ? pixTotal : subtotal)}</dd>
                </div>
              </dl>

              <Link
                to="/checkout"
                onClick={closeDrawer}
                className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Finalizar compra
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  to="/carrinho"
                  onClick={closeDrawer}
                  className="flex h-11 items-center justify-center rounded-full border border-primary text-sm font-semibold text-primary hover:bg-primary/5"
                >
                  Ver sacola
                </Link>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="h-11 text-sm font-medium text-muted-foreground hover:text-primary"
                >
                  Continuar comprando
                </button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
