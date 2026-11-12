import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { brl } from "@/lib/format";
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
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFav = favs?.has(p.id) ?? false;
  const { data: settings } = useStoreSettings();
  const flagUrl = flagUrlFor(p.country, 40);
  const pay = settings?.payments;
  const installmentPreview = pay?.cardEnabled ? installmentPlan(Number(p.price), pay) : [];
  const installment = installmentPreview[installmentPreview.length - 1];

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-transparent">
      <div className="relative">
        <Link
          to="/produto/$slug"
          params={{ slug: p.slug }}
          className="block"
          aria-label={`Ver ${p.name}`}
        >
          <div className="flex h-56 items-center justify-center px-4 pt-5 sm:h-64 sm:px-5 sm:pt-6">
            {p.image_url ? (
              <ProductImage
                src={p.image_url}
                alt={p.name}
                displaySize={320}
                width={240}
                height={320}
                sizes="(max-width: 767px) 50vw, (max-width: 1279px) 20vw, 18vw"
                className="h-full w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="h-full w-full bg-muted/30" aria-hidden />
            )}
          </div>
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
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-foreground transition-colors hover:text-primary"
        >
          <Heart className={`h-4 w-4 ${isFav ? "fill-primary text-primary" : ""}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3 text-left sm:px-5 sm:pb-5">
        {p.country && (
          <div className="flex items-center gap-1.5 text-xs text-foreground sm:text-[13px]">
            {flagUrl && (
              <img
                src={flagUrl}
                alt=""
                width={20}
                height={14}
                loading="lazy"
                className="h-3.5 w-5 rounded-[2px] object-cover"
              />
            )}
            <span className="line-clamp-1 font-medium">{p.country}</span>
          </div>
        )}

        <Link
          to="/produto/$slug"
          params={{ slug: p.slug }}
          className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-foreground transition-colors hover:text-primary sm:text-[15px]"
        >
          {p.name}
        </Link>

        {p.grape ? (
          <p className="line-clamp-1 text-xs sm:text-[13px]">
            <span className="text-muted-foreground">Uva: </span>
            <span className="font-semibold text-primary">{p.grape}</span>
          </p>
        ) : (
          <p className="min-h-4 text-xs sm:min-h-5" aria-hidden>
            &nbsp;
          </p>
        )}

        <div className="mt-1 border-t border-dashed border-border/80 pt-3">
          <div className="text-xl font-bold leading-none tracking-tight text-primary sm:text-2xl">
            {brl(p.price)}
          </div>
          {settings?.payments?.pixEnabled && (settings.payments.pixDiscount ?? 0) > 0 && (
            <div className="mt-1 text-[11px] font-semibold text-primary sm:text-xs">
              {brl(Number(p.price) * (1 - settings.payments.pixDiscount / 100))} no PIX
              <span className="ml-1 font-normal text-muted-foreground">
                (-{settings.payments.pixDiscount}%)
              </span>
            </div>
          )}
          {installment && (
            <div className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              ou {installment.n}x de {brl(installment.value)}{" "}
              {installment.hasInterest ? "com juros" : "sem juros"}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
