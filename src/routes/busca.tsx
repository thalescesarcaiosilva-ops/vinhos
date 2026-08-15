import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { ProductCard, type Product } from "@/components/store/ProductCard";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { z } from "zod";
import { StoreContainer } from "@/components/store/StoreContainer";
import { STORE } from "@/lib/settings";
import { pageMeta } from "@/lib/seo";

const searchSchema = z.object({
  q: z.string().optional(),
  pais: z.string().optional(),
  uva: z.string().optional(),
  tipo: z.string().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "name"]).optional(),
});
type SearchParams = z.infer<typeof searchSchema>;
const FILTER_KEYS = [
  "pais",
  "uva",
  "tipo",
  "min",
  "max",
] as const satisfies readonly (keyof SearchParams)[];

export const Route = createFileRoute("/busca")({
  validateSearch: searchSchema,
  head: () =>
    pageMeta({
      title: `Buscar vinhos — ${STORE.name}`,
      description: `Busque vinhos e espumantes na ${STORE.name} por nome, país, uva ou tipo. Entrega para todo o Brasil.`,
      path: "/busca",
      noindex: true,
    }),
  component: SearchPage,
});

function SearchPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/busca" });
  const [q, setQ] = useState(sp.q ?? "");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["search", sp],
    queryFn: async () => {
      const tokens = tokenizeSearch(sp.q ?? "");

      const { data, error } = await supabase.rpc("search_products", {
        q: sp.q ?? null,
        filter_country: sp.pais ?? null,
        filter_grape: sp.uva ?? null,
        filter_wine_type: sp.tipo ?? null,
        min_price: sp.min ?? null,
        max_price: sp.max ?? null,
        result_limit: 200,
      });
      if (error) throw error;

      let rows = data ?? [];

      if (
        tokens.length &&
        sp.sort !== "price_asc" &&
        sp.sort !== "price_desc" &&
        sp.sort !== "name"
      ) {
        rows = [...rows].sort((a, b) => scoreSearch(b, tokens) - scoreSearch(a, tokens));
      } else if (sp.sort === "price_asc") {
        rows = [...rows].sort((a, b) => Number(a.price) - Number(b.price));
      } else if (sp.sort === "price_desc") {
        rows = [...rows].sort((a, b) => Number(b.price) - Number(a.price));
      } else if (sp.sort === "name") {
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      }

      return rows.slice(0, 60) as Product[];
    },
  });

  const { data: facets } = useQuery({
    queryKey: ["search-facets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("country,grape,wine_type")
        .eq("is_active", true)
        .limit(1000);
      const countries = new Set<string>();
      const grapes = new Set<string>();
      const types = new Set<string>();
      (data ?? []).forEach((r) => {
        if (r.country) countries.add(r.country);
        if (r.grape) grapes.add(r.grape);
        if (r.wine_type) types.add(r.wine_type);
      });
      return {
        countries: [...countries].sort(),
        grapes: [...grapes].sort(),
        types: [...types].sort(),
      };
    },
  });

  const update = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const activeCount = useMemo(
    () => FILTER_KEYS.filter((key) => sp[key] != null && sp[key] !== "").length,
    [sp],
  );

  return (
    <StoreContainer className="py-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q || undefined });
        }}
        className="mb-6 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar vinhos, uvas, países..."
            className="w-full rounded-full border border-border bg-background py-3 pl-10 pr-4 text-base outline-none focus:border-primary md:text-sm"
          />
        </div>
        <button className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
          Buscar
        </button>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium md:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </form>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} md:block`}>
          <div className="rounded-sm border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold">Filtros</h2>
              {activeCount > 0 && (
                <button
                  onClick={() => navigate({ search: { q: sp.q } })}
                  className="text-xs text-primary hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>

            <Filter
              label="Tipo"
              value={sp.tipo}
              options={facets?.types ?? []}
              onChange={(v) => update({ tipo: v })}
            />
            <Filter
              label="País"
              value={sp.pais}
              options={facets?.countries ?? []}
              onChange={(v) => update({ pais: v })}
            />
            <Filter
              label="Uva"
              value={sp.uva}
              options={facets?.grapes ?? []}
              onChange={(v) => update({ uva: v })}
            />

            <div className="mb-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Faixa de preço
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={sp.min ?? ""}
                  onChange={(e) =>
                    update({ min: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={sp.max ?? ""}
                  onChange={(e) =>
                    update({ max: e.target.value ? Number(e.target.value) : undefined })
                  }
                  className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Buscando..." : `${data?.length ?? 0} resultado(s)`}
              {sp.q && (
                <span>
                  {" "}
                  para "<strong className="text-foreground">{sp.q}</strong>"
                </span>
              )}
            </p>
            <select
              value={sp.sort ?? "relevance"}
              onChange={(e) => update({ sort: e.target.value })}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="relevance">Relevância</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="name">Nome A-Z</option>
            </select>
          </div>

          {isLoading ? (
            <div
              className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"
              aria-label="Carregando produtos"
            >
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[3/5] animate-pulse rounded-sm border border-border/60 bg-muted"
                />
              ))}
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-card p-12 text-center">
              <X className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-foreground">Nenhum produto encontrado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente ajustar os filtros ou a busca.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {data?.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </StoreContainer>
  );
}

function scoreSearch(
  p: {
    name: string;
    short_description?: string | null;
    brand?: string | null;
    grape?: string | null;
  },
  tokens: string[],
) {
  const name = normalizeSearch(p.name);
  const short = normalizeSearch(p.short_description ?? "");
  const brand = normalizeSearch(p.brand ?? "");
  const grape = normalizeSearch(p.grape ?? "");
  let score = 0;
  for (const t of tokens) {
    if (name.includes(t)) score += name === t ? 30 : name.startsWith(t) ? 20 : 12;
    else if (brand.includes(t)) score += 8;
    else if (grape.includes(t)) score += 6;
    else if (short.includes(t)) score += 3;
    else return -1;
  }
  return score;
}

function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenizeSearch(q: string) {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
