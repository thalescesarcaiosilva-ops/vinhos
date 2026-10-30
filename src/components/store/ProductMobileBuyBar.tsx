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

function buyBlockOnScreen(id: string | undefined) {
  if (!id) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  const rect = target.getBoundingClientRect();
  const height = window.visualViewport?.height ?? window.innerHeight;
  return rect.top < height * 0.7 && rect.bottom > height * 0.2;
}

function footerCoversBar() {
  const footer = document.querySelector("footer[data-site-footer]");
  if (!footer) return false;
  const rect = footer.getBoundingClientRect();
  const height = window.visualViewport?.height ?? window.innerHeight;
  return rect.top < height - 8;
}

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
  const [hidden, setHidden] = useState(true);
  const [bottomOffset, setBottomOffset] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      setHidden(buyBlockOnScreen(watchId) || footerCoversBar());
      const viewport = window.visualViewport;
      if (!viewport) {
        setBottomOffset(0);
        return;
      }
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setBottomOffset(Math.max(0, covered));
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [watchId]);

  return (
    <div
      className={`fixed inset-x-0 z-30 border-t border-border/50 bg-background px-4 pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.07)] transition-opacity duration-200 xl:hidden ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={hidden}
      style={{
        bottom: bottomOffset,
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
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
          <p className="font-semibold text-primary">{brl(price)}</p>
        </div>
        <button
          type="button"
          onClick={onBuy}
          disabled={disabled}
          className="min-h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Comprar{quantity > 1 ? ` (${quantity})` : ""}
        </button>
      </div>
    </div>
  );
}
