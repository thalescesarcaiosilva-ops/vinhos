import { Link } from "@tanstack/react-router";
import { ShoppingBag, Heart } from "lucide-react";
import { brl } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { useFavorites, useToggleFavorite } from "@/lib/favorites";
import { ProductImage } from "@/components/store/ProductImage";
import { useStoreSettings, installmentPlan } from "@/lib/store-settings";
import { flagUrlFor } from "@/lib/country-flags";

export type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  country: string | null;
  grape: string | null;
  rating: number | null;
};

export function ProductCard({ p }: { p: Product }) {
  const { add } = useCart();
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFav = favs?.has(p.id) ?? false;
  const { data: settings } = useStoreSettings();
  const flagUrl = flagUrlFor(p.country, 40);
  const pay = settings?.payments;
  const installmentPreview = pay?.cardEnabled ? installmentPlan(Number(p.price), pay) : [];
  const installment = installmentPreview[installmentPreview.length - 1];

  return (
    <article className="group flex h-full flex-col overflow-hidden border border-border/60 bg-card text-center">
      <div className="relative aspect-[3/4] overflow-hidden">
        <Link
          to="/produto/$slug"
          params={{ slug: p.slug }}
          className="block h-full"
          aria-label={`Ver ${p.name}`}
        >
          {p.image_url && (
            <ProductImage
              src={p.image_url}
              alt={p.name}
              displaySize={320}
              width={320}
              height={427}
              sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.02]"
            />
          )}
        </Link>
        <button
          type="button"
          aria-label={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFav.mutate({
              product: {
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: Number(p.price),
                image: p.image_url,
                country: p.country,
              },
              isFav,
            });
          }}
          className="absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border/50 transition-colors hover:bg-background hover:text-primary sm:right-3 sm:top-3 sm:h-9 sm:w-9"
        >
          <Heart className={`h-4 w-4 ${isFav ? "fill-primary text-primary" : ""}`} />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center gap-2 p-3 sm:p-4">
        <Link
          to="/produto/$slug"
          params={{ slug: p.slug }}
          className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[color:var(--product-name)] transition-colors hover:text-primary"
        >
          {p.name}
        </Link>
        <div className="min-h-10 space-y-1 text-[11px] leading-4 text-muted-foreground sm:text-xs">
          {p.country && (
            <div className="flex items-center justify-center gap-1.5">
              {flagUrl && (
                <img
                  src={flagUrl}
                  alt=""
                  width={20}
                  height={14}
                  loading="lazy"
                  className="h-3.5 w-5 object-cover"
                />
              )}
              <span className="line-clamp-1">{p.country}</span>
            </div>
          )}
          {p.grape && <p className="line-clamp-1">Uva: {p.grape}</p>}
        </div>
        <div className="mt-auto w-full pt-1">
          {p.compare_at_price && Number(p.compare_at_price) > Number(p.price) && (
            <div className="text-[11px] text-muted-foreground line-through">
              de {brl(p.compare_at_price)}
            </div>
          )}
          <div className="font-serif text-xl font-bold leading-tight text-[color:var(--product-price)] sm:text-2xl">
            {brl(p.price)}
          </div>
          {settings?.payments?.pixEnabled && (settings.payments.pixDiscount ?? 0) > 0 && (
            <div className="mt-0.5 text-[11px] font-semibold text-[color:var(--brand-primary)] sm:text-xs">
              {brl(Number(p.price) * (1 - settings.payments.pixDiscount / 100))} no PIX
              <span className="ml-1 font-normal text-muted-foreground">
                (-{settings.payments.pixDiscount}%)
              </span>
            </div>
          )}
          {installment && (
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              ou {installment.n}x de {brl(installment.value)}{" "}
              {installment.hasInterest ? "com juros" : "sem juros"}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            add({
              id: p.id,
              name: p.name,
              slug: p.slug,
              price: Number(p.price),
              image: p.image_url,
            });
            toast.success("Adicionado ao carrinho");
          }}
          className="mt-1 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-primary bg-transparent px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ShoppingBag className="h-4 w-4" /> Comprar
        </button>
      </div>
    </article>
  );
}
