import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { useFavoritesList, removeFavorite } from "@/lib/favorites";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { toSiteImageUrl } from "@/lib/image-url";
import { toast } from "sonner";
import { pageMeta } from "@/lib/seo";
import { STORE } from "@/lib/settings";

export const Route = createFileRoute("/favoritos")({
  component: FavoritesPage,
  head: () =>
    pageMeta({
      title: `Meus Favoritos — ${STORE.name}`,
      description: `Seus vinhos favoritos salvos na ${STORE.name}.`,
      path: "/favoritos",
      noindex: true,
    }),
});

function FavoritesPage() {
  const list = useFavoritesList();
  const { add } = useCart();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <Heart className="h-6 w-6 text-primary" />
          <h1 className="font-serif text-3xl font-bold text-foreground">Meus Favoritos</h1>
          <span className="text-sm text-muted-foreground">({list.length})</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-sm border border-border bg-card p-12 text-center">
            <p className="text-base text-muted-foreground">Nenhum produto nos favoritos.</p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continuar comprando
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className="flex gap-4 rounded-sm border border-border bg-card p-4">
                <Link
                  to="/produto/$slug"
                  params={{ slug: p.slug }}
                  className="h-28 w-24 shrink-0 overflow-hidden rounded-sm bg-cream"
                >
                  {p.image && <img src={toSiteImageUrl(p.image)} alt={p.name} className="h-full w-full object-contain p-2" />}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    to="/produto/$slug"
                    params={{ slug: p.slug }}
                    className="line-clamp-2 text-sm font-medium text-foreground hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 font-serif text-xl font-bold text-primary">{brl(p.price)}</div>
                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        add({ id: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image });
                        toast.success("Adicionado ao carrinho");
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-[color:var(--buy)] px-3 py-1.5 text-xs font-medium text-[color:var(--buy-foreground)] shadow-sm transition hover:brightness-110"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Comprar
                    </button>
                    <button
                      onClick={() => removeFavorite(p.id)}
                      aria-label="Remover"
                      className="grid h-8 w-8 place-items-center rounded-sm border border-border text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </main>
  );
}
