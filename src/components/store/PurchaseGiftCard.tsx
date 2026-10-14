import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { ProductImage } from "@/components/store/ProductImage";
import { usePurchaseGift } from "@/lib/purchase-gift";

export function PurchaseGiftCard({ hideForProductId }: { hideForProductId?: string }) {
  const { data: gift } = usePurchaseGift();
  if (!gift || gift.id === hideForProductId) return null;

  const inStock = gift.stock > 0;

  return (
    <Link
      to="/produto/$slug"
      params={{ slug: gift.slug }}
      className="flex gap-3 rounded-sm border border-primary/25 bg-primary/[0.06] p-3 transition hover:border-primary/40"
    >
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-sm bg-background">
        <ProductImage
          src={gift.image_url}
          alt={gift.name}
          displaySize={80}
          width={48}
          height={64}
          className="h-full w-full object-contain p-0.5"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Brinde na sua compra
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {gift.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {inStock
            ? "1 unidade grátis em qualquer pedido"
            : "Brinde temporariamente indisponível"}
        </p>
        {inStock && (
          <p className="mt-0.5 text-sm font-bold text-primary">Grátis</p>
        )}
      </div>
    </Link>
  );
}
