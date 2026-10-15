import { Link } from "@tanstack/react-router";
import { Check, Gift } from "lucide-react";
import { ProductImage } from "@/components/store/ProductImage";
import { brl } from "@/lib/format";
import { POLICY_SLUGS } from "@/lib/policy-links";
import { useFirstPurchaseEligible, usePurchaseGift } from "@/lib/purchase-gift";

export function PurchaseGiftCard({ hideForProductId }: { hideForProductId?: string }) {
  const { data: gift } = usePurchaseGift();
  const { eligible, isReturningCustomer } = useFirstPurchaseEligible();
  if (!gift || gift.id === hideForProductId) return null;

  const catalog = Number(gift.price) || 0;
  const inStock = gift.stock > 0;

  return (
    <div className="flex items-center overflow-hidden rounded-sm border border-primary/70 bg-[#fbf4f4]">
      <Link
        to="/produto/$slug"
        params={{ slug: gift.slug }}
        className="flex h-[5.75rem] w-[4.5rem] shrink-0 items-center justify-center bg-white sm:h-[6.25rem] sm:w-[5rem]"
        aria-label={gift.name}
      >
        <ProductImage
          src={gift.image_url}
          alt=""
          displaySize={120}
          width={80}
          height={100}
          className="h-full w-full object-contain p-0.5"
        />
      </Link>
      <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3.5">
        <Link to="/produto/$slug" params={{ slug: gift.slug }} className="block hover:opacity-90">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary sm:text-[11px]">
            <Gift className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
            <span className="truncate">Brinde de primeira compra</span>
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold leading-tight text-foreground sm:text-[15px]">
            {gift.name}
          </p>
          {inStock ? (
            <p className="mt-1.5 whitespace-nowrap text-[12px] leading-none text-muted-foreground sm:text-sm">
              {catalog > 0 && (
                <>
                  de <span className="line-through">{brl(catalog)}</span> por{" "}
                </>
              )}
              <span className="font-serif text-[1.15rem] font-bold leading-none text-primary sm:text-[1.35rem]">
                {brl(0)}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              Brinde temporariamente indisponível
            </p>
          )}
        </Link>
        {inStock && (
          <Link
            to="/politicas/$slug"
            params={{ slug: POLICY_SLUGS.firstPurchaseGift }}
            className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-primary hover:underline sm:text-[13px]"
          >
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="truncate">
              {isReturningCustomer && !eligible
                ? "Válido só na primeira compra da conta"
                : "Válido apenas na primeira compra"}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
