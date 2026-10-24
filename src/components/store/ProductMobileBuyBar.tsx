import { useEffect, useState } from "react";

import { ProductImage } from "@/components/store/ProductImage";
import { brl } from "@/lib/format";

type ProductMobileBuyBarProps = {
  image: string | null | undefined;
  name: string;
  price: number;
  compareAt?: number | null;
  quantity: number;
  disabled?: boolean;
  onBuy: () => void;
  /** Id do botão principal; a barra aparece depois que ele sai da tela. */
  watchId?: string;
};

export function ProductMobileBuyBar({
  image,
  name,
  price,
  compareAt,
  quantity,
  disabled = false,
  onBuy,
  watchId,
}: ProductMobileBuyBarProps) {
  const [footerVisible, setFooterVisible] = useState(false);
  const [mainBuyVisible, setMainBuyVisible] = useState(true);

  useEffect(() => {
    const footer = document.querySelector("footer[data-site-footer]");
    if (!footer || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => setFooterVisible(entry.isIntersecting), {
      threshold: 0,
    });

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!watchId || typeof IntersectionObserver === "undefined") {
      setMainBuyVisible(false);
      return;
    }
    const target = document.getElementById(watchId);
    if (!target) {
      setMainBuyVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setMainBuyVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  const hidden = footerVisible || mainBuyVisible;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background px-4 pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.07)] transition duration-200 xl:hidden ${
        hidden ? "pointer-events-none translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}
      aria-hidden={hidden}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Compra rápida"
    >
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden">
          <ProductImage
            src={image}
            alt=""
            displaySize={48}
            width={40}
            height={48}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{name}</p>
          {compareAt != null && compareAt > price && (
            <p className="text-[11px] font-medium leading-none text-[color:var(--sale)] line-through">
              de {brl(compareAt)}
            </p>
          )}
          <p className="font-semibold text-[color:var(--buy)]">{brl(price)}</p>
        </div>
        <button
          type="button"
          onClick={onBuy}
          disabled={disabled}
          className="min-h-11 shrink-0 rounded-sm bg-[color:var(--buy)] px-5 text-sm font-bold uppercase tracking-wide text-[color:var(--buy-foreground)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Comprar{quantity > 1 ? ` (${quantity})` : ""}
        </button>
      </div>
    </div>
  );
}
