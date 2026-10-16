import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { toSiteImageUrl } from "@/lib/image-url";

export function CartDrawer() {
  const { items, setQty, remove, subtotal, count, drawerOpen, setDrawerOpen, closeDrawer } = useCart();

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-serif text-lg">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Seu carrinho ({count})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            <button
              onClick={closeDrawer}
              className="mt-2 rounded-sm border border-border px-4 py-2 text-sm hover:bg-cream"
            >
              Continuar comprando
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-4">
                {items.map((i) => (
                  <li key={i.id} className="flex gap-3 border-b border-border pb-4">
                    <Link
                      to="/produto/$slug"
                      params={{ slug: i.slug }}
                      onClick={closeDrawer}
                      className="block h-20 w-16 shrink-0 rounded-sm bg-cream"
                    >
                      {i.image && <img src={toSiteImageUrl(i.image)} alt={i.name} className="h-full w-full object-contain p-1" />}
                    </Link>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Link
                        to="/produto/$slug"
                        params={{ slug: i.slug }}
                        onClick={closeDrawer}
                        className="line-clamp-2 text-sm font-medium hover:text-primary"
                      >
                        {i.name}
                      </Link>
                      <div className="text-sm font-semibold text-[color:var(--product-price)]">
                        {brl(i.price * i.quantity)}
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <div className="inline-flex items-center rounded-sm border border-border">
                          <button
                            onClick={() => setQty(i.id, i.quantity - 1)}
                            className="grid h-7 w-7 place-items-center hover:bg-cream"
                            aria-label="Diminuir"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-sm">{i.quantity}</span>
                          <button
                            onClick={() => setQty(i.id, i.quantity + 1)}
                            className="grid h-7 w-7 place-items-center hover:bg-cream"
                            aria-label="Aumentar"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => remove(i.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border bg-cream/40 px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-serif text-lg font-bold text-primary">{brl(subtotal)}</span>
              </div>
              <div className="grid gap-2">
                <Link
                  to="/checkout"
                  onClick={closeDrawer}
                  className="inline-flex items-center justify-center rounded-sm bg-[color:var(--buy)] px-4 py-3 text-sm font-bold uppercase tracking-wider text-[color:var(--buy-foreground)] hover:brightness-110"
                >
                  Finalizar compra
                </Link>
                <Link
                  to="/carrinho"
                  onClick={closeDrawer}
                  className="inline-flex items-center justify-center rounded-sm border border-border px-4 py-2 text-sm hover:bg-background"
                >
                  Ver carrinho completo
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
