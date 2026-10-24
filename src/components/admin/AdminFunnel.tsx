import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FUNNEL_STEPS, type FunnelStep } from "@/lib/funnel";

const SAO_PAULO_TZ = "America/Sao_Paulo";

const STEP_LABEL: Record<FunnelStep, string> = {
  cart: "Carrinho",
  checkout: "Checkout",
  personal: "Dados pessoais",
  shipping: "Entrega",
  payment: "Pagamento",
  order: "Comprou",
  paid: "Pagou",
};

const RANGES = [
  { id: "10m", label: "10 minutos" },
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const PAID_STATUSES = new Set([
  "confirmed",
  "paid",
  "separating",
  "invoiced",
  "shipped",
  "out_for_delivery",
  "delivered",
]);
const PAID_PAYMENT = new Set(["confirmed", "paid", "approved"]);

type OrderLite = { status: string; payment_status: string | null };

function dateKeyInSaoPaulo(input: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);
}

function saoPauloDayStartUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00-03:00`);
}

function addSaoPauloCalendarDays(dateKey: string, delta: number): string {
  const d = saoPauloDayStartUtc(dateKey);
  d.setUTCDate(d.getUTCDate() + delta);
  return dateKeyInSaoPaulo(d);
}

function rangeStart(id: RangeId): Date {
  const now = new Date();
  if (id === "10m") return new Date(now.getTime() - 10 * 60 * 1000);
  const today = dateKeyInSaoPaulo(now);
  if (id === "today") return saoPauloDayStartUtc(today);
  const days = id === "7d" ? 7 : 30;
  return saoPauloDayStartUtc(addSaoPauloCalendarDays(today, -(days - 1)));
}

function isPaidOrder(o: OrderLite) {
  return PAID_STATUSES.has(o.status) || PAID_PAYMENT.has(o.payment_status ?? "");
}

async function fetchEvents(fromIso: string) {
  const all: { session_id: string; step: string }[] = [];
  const page = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("store_funnel_events")
      .select("session_id, step")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

async function fetchOrders(fromIso: string) {
  const all: OrderLite[] = [];
  const page = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("status, payment_status")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return all;
}

export function AdminFunnel() {
  const [range, setRange] = useState<RangeId>("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<FunnelStep, number>>({
    cart: 0,
    checkout: 0,
    personal: 0,
    shipping: 0,
    payment: 0,
    order: 0,
    paid: 0,
  });
  const [generated, setGenerated] = useState(0);
  const [paidOrders, setPaidOrders] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const fromIso = rangeStart(range).toISOString();
        const [events, orders] = await Promise.all([fetchEvents(fromIso), fetchOrders(fromIso)]);
        if (cancelled) return;
        const sets = Object.fromEntries(FUNNEL_STEPS.map((step) => [step, new Set<string>()])) as Record<
          FunnelStep,
          Set<string>
        >;
        for (const row of events) {
          if ((FUNNEL_STEPS as readonly string[]).includes(row.step)) {
            sets[row.step as FunnelStep].add(row.session_id);
          }
        }
        const next = Object.fromEntries(FUNNEL_STEPS.map((step) => [step, sets[step].size])) as Record<
          FunnelStep,
          number
        >;
        setCounts(next);
        setGenerated(orders.length);
        setPaidOrders(orders.filter(isPaidOrder).length);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar o funil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const view = useMemo(() => {
    const base = Math.max(0, ...FUNNEL_STEPS.map((step) => counts[step]));
    let bottleneck: { from: string; to: string; drop: number; pct: number } | null = null;
    for (let i = 1; i < FUNNEL_STEPS.length; i++) {
      const prev = counts[FUNNEL_STEPS[i - 1]];
      const cur = counts[FUNNEL_STEPS[i]];
      const drop = prev - cur;
      if (drop <= 0 || prev <= 0) continue;
      const pct = Math.round((drop / prev) * 100);
      if (!bottleneck || drop > bottleneck.drop) {
        bottleneck = {
          from: STEP_LABEL[FUNNEL_STEPS[i - 1]],
          to: STEP_LABEL[FUNNEL_STEPS[i]],
          drop,
          pct,
        };
      }
    }
    return {
      base,
      bottleneck,
      rows: FUNNEL_STEPS.map((step) => ({
        step,
        label: STEP_LABEL[step],
        count: counts[step],
        pct: base > 0 ? Math.min(100, Math.round((counts[step] / base) * 100)) : 0,
      })),
    };
  }, [counts]);

  const unpaid = Math.max(0, generated - paidOrders);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-primary">Funil da loja</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Visitas distintas em cada etapa. O gargalo é a maior queda entre uma etapa e a seguinte.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                range === item.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="rounded-sm border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Comportamento do cliente</h3>
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {RANGES.find((item) => item.id === range)?.label}
          </span>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[720px] items-start">
                {view.rows.map((row, index) => (
                  <div key={row.step} className="flex min-w-0 flex-1 items-start">
                    {index > 0 && <div className="mt-3 h-px flex-1 bg-border" />}
                    <div className="flex w-24 shrink-0 flex-col items-center text-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold text-foreground">
                        {row.count}
                      </span>
                      <span className="mt-2 text-xs font-medium text-foreground">{row.label}</span>
                    </div>
                    {index < view.rows.length - 1 && <div className="mt-3 h-px flex-1 bg-border" />}
                  </div>
                ))}
              </div>
            </div>

            {view.bottleneck ? (
              <p className="mt-4 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
                Maior gargalo: entre {view.bottleneck.from} e {view.bottleneck.to}, queda de {view.bottleneck.drop}{" "}
                visitas ({view.bottleneck.pct}%).
              </p>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                As etapas da visita passam a ser contadas depois que esta versão da loja estiver no ar. Até lá, use os
                pedidos gerados e pagos abaixo.
              </p>
            )}
          </>
        )}
      </section>

      <section className="rounded-sm border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Funil de conversão</h3>
        <p className="mt-1 text-xs text-muted-foreground">Percentual em relação à etapa com mais visitas no período.</p>
        <div className="mt-5 space-y-4">
          {view.rows.map((row) => (
            <div key={row.step}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="text-muted-foreground">
                  {row.pct}% ({row.count})
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sm border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos gerados</p>
          <p className="mt-2 font-serif text-3xl font-bold text-primary">{loading ? "—" : generated}</p>
        </div>
        <div className="rounded-sm border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos pagos</p>
          <p className="mt-2 font-serif text-3xl font-bold text-primary">{loading ? "—" : paidOrders}</p>
        </div>
        <div className="rounded-sm border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Gerados e ainda sem pagamento</p>
          <p className="mt-2 font-serif text-3xl font-bold text-primary">{loading ? "—" : unpaid}</p>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Os três números vêm da tabela de pedidos e já valem para o período escolhido. As barras acima contam visitas, e
        uma visita pode gerar mais de um pedido.
      </p>
    </div>
  );
}
