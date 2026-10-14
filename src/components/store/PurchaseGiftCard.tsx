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
      <p
        className={
          compact
            ? "mt-1 line-clamp-2 text-sm font-medium leading-snug text-foreground"
            : "mt-1 text-sm font-medium leading-snug text-foreground"
        }
      >
        {gift.name}
      </p>
      {inStock ? (
        <div className="mt-2">
          <p className={compact ? "text-sm leading-snug" : "text-base leading-snug"}>
            {catalog > 0 && (
              <>
                <span className="text-muted-foreground">de </span>
                <span className="text-muted-foreground line-through">{brl(catalog)}</span>
                <span className="text-muted-foreground"> por </span>
              </>
            )}
            <span className="font-serif text-xl font-bold text-primary">{brl(0)}</span>
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
          {isReturningCustomer && !eligible && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Exclusivo do primeiro pedido desta conta
            </p>
          )}
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
      className="flex items-stretch gap-2 overflow-hidden rounded-sm border-2 border-primary/35 bg-primary/[0.07] py-2 pr-3 pl-1 transition hover:border-primary/55"
    >
      <div className="h-[7.5rem] w-[5.25rem] shrink-0 overflow-hidden">
        <ProductImage
          src={gift.image_url}
          alt={gift.name}
          displaySize={160}
          width={84}
          height={120}
          className="h-full w-full object-contain object-center"
        />
      </div>
      <FirstPurchaseGiftHighlight gift={gift} compact />
    </Link>
  );
}
