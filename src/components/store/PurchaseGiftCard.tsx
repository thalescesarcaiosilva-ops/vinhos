import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { ProductImage } from "@/components/store/ProductImage";
import { brl } from "@/lib/format";
import { useFirstPurchaseEligible, usePurchaseGift, type PurchaseGiftProduct } from "@/lib/purchase-gift";

export function FirstPurchaseGiftHighlight({
  gift,
  compact = false,
}: {
  gift: PurchaseGiftProduct;
  compact?: boolean;
}) {
  const catalog = Number(gift.price) || 0;
  const inStock = gift.stock > 0;
  const { eligible, isReturningCustomer } = useFirstPurchaseEligible();

  return (
    <div
      className={
        compact
          ? "min-w-0 flex-1"
          : "rounded-sm border-2 border-primary/35 bg-primary/[0.07] p-4"
      }
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Brinde de primeira compra
      </p>
      {!compact && (
        <p className="mt-1 text-sm font-medium leading-snug text-foreground">{gift.name}</p>
      )}
      {inStock ? (
        <div className={compact ? "mt-1" : "mt-3"}>
          {catalog > 0 && (
            <p
              className={
                compact
                  ? "text-xs text-muted-foreground line-through"
                  : "text-base text-muted-foreground line-through"
              }
            >
              de {brl(catalog)}
            </p>
          )}
          <p
            className={
              compact
                ? "font-serif text-2xl font-bold leading-none text-primary"
                : "font-serif text-4xl font-bold leading-none text-primary"
            }
          >
            {brl(0)}
          </p>
          <p
            className={
              compact
                ? "mt-0.5 text-sm font-extrabold uppercase tracking-wide text-primary"
                : "mt-1 text-lg font-extrabold uppercase tracking-[0.14em] text-primary"
            }
          >
            Grátis
          </p>
          <p className={compact ? "mt-0.5 text-xs text-muted-foreground" : "mt-1 text-sm text-foreground"}>
            {isReturningCustomer && !eligible
              ? "Exclusivo do primeiro pedido desta conta"
              : "na primeira compra na loja"}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Brinde temporariamente indisponível</p>
      )}
    </div>
  );
}

export function PurchaseGiftCard({ hideForProductId }: { hideForProductId?: string }) {
  const { data: gift } = usePurchaseGift();
  if (!gift || gift.id === hideForProductId) return null;

  return (
    <Link
      to="/produto/$slug"
      params={{ slug: gift.slug }}
      className="flex gap-3 rounded-sm border-2 border-primary/35 bg-primary/[0.07] p-3 transition hover:border-primary/55"
    >
      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-background">
        <ProductImage
          src={gift.image_url}
          alt={gift.name}
          displaySize={80}
          width={56}
          height={80}
          className="h-full w-full object-contain p-0.5"
        />
      </div>
      <FirstPurchaseGiftHighlight gift={gift} compact />
    </Link>
  );
}
