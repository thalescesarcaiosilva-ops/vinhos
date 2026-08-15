import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";
import { useFavoritesList, removeFavorite } from "@/lib/favorites";
import { brl } from "@/lib/format";
import { toSiteImageUrl } from "@/lib/image-url";

export function FavoritesMenu({ className = "" }: { className?: string }) {
  const list = useFavoritesList();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Favoritos"
        className="relative grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:text-primary"
      >
        <Heart className="h-6 w-6" />
        {list.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
            {list.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-sm border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Meus Favoritos
            </span>
            <Link
              to="/favoritos"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>

          {list.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum produto nos favoritos.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
                  <Link
                    to="/produto/$slug"
                    params={{ slug: p.slug }}
                    onClick={() => setOpen(false)}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-cream"
                  >
                    {p.image && (
                      <img src={toSiteImageUrl(p.image)} alt={p.name} className="h-full w-full object-contain p-1" />
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      to="/produto/$slug"
                      params={{ slug: p.slug }}
                      onClick={() => setOpen(false)}
                      className="line-clamp-2 text-sm font-medium text-foreground hover:text-primary"
                    >
                      {p.name}
                    </Link>
                    <span className="font-serif text-base font-bold text-primary">{brl(p.price)}</span>
                  </div>
                  <button
                    onClick={() => removeFavorite(p.id)}
                    aria-label="Remover dos favoritos"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
