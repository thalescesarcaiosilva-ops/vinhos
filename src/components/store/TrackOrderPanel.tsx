import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupTrack7Tracking } from "@/lib/track7.functions";
import type { Track7TrackingData } from "@/lib/track7";
import { resolveTrack7StageIndex, sortTrack7EventsNewestFirst, TRACK7_STAGES } from "@/lib/track7";
import { cn } from "@/lib/utils";

type Props = {
  initialCode?: string;
  initialPedido?: string;
  /** Quando true, ajusta os espaços para uso dentro da área da conta. */
  embedded?: boolean;
};

const STAGE_ICONS = [FileText, ArrowRight, RefreshCw, Truck, MapPin, Clock] as const;

export function TrackOrderPanel({
  initialCode = "",
  initialPedido = "",
  embedded = false,
}: Props) {
  const lookup = useServerFn(lookupTrack7Tracking);
  const [codigo, setCodigo] = useState((initialCode || initialPedido).trim());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Track7TrackingData | null>(null);

  useEffect(() => {
    const code = (initialCode || initialPedido).trim();
    if (!code) return;
    setCodigo(code);
    void buscar(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando query muda
  }, [initialCode, initialPedido]);

  async function buscar(raw?: string) {
    const value = (raw ?? codigo).trim();
    if (!value || value.length < 2) {
      setError("Informe um código de rastreio válido");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await lookup({ data: { query: value } });
      if (!res.ok) {
        setResult(null);
        setError(res.error);
        return;
      }
      setResult(res.data);

      if (typeof window !== "undefined" && !embedded) {
        const params = new URLSearchParams();
        const code = res.data.tracking_code || value;
        params.set("codigo", code);
        const next = `/rastreio?${params.toString()}`;
        window.history.replaceState(null, "", next);
      }
    } catch (err: unknown) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Não foi possível consultar o rastreio.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void buscar();
  }

  const timeline = useMemo(
    () => sortTrack7EventsNewestFirst(result?.events ?? []),
    [result],
  );
  const stageIndex = useMemo(
    () =>
      result
        ? resolveTrack7StageIndex({ ...result, events: timeline })
        : 0,
    [result, timeline],
  );
  const sectionSpacing = embedded ? "mt-6" : "mt-8";

  return (
    <div aria-busy={loading}>
      <form onSubmit={onSubmit}>
        <Label htmlFor="codigoRastreamento" className="text-sm text-foreground">
          Código de rastreio ou ID do pedido
        </Label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            id="codigoRastreamento"
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex.: PQA1234567890BR"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tracking-error" : "tracking-help"}
            className="h-11 rounded-sm bg-background text-sm tracking-wide shadow-none"
          />
          <Button
            type="submit"
            disabled={loading}
            className="h-11 shrink-0 rounded-sm px-6 shadow-none"
          >
            {loading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>
        <p id="tracking-help" className="mt-2 text-xs text-muted-foreground">
          Use o código exatamente como recebido no e-mail de confirmação.
        </p>

        {error && (
          <p id="tracking-error" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {loading && (
        <p className={cn(sectionSpacing, "text-sm text-muted-foreground")} role="status">
          Consultando as informações de entrega…
        </p>
      )}

      {!loading && !error && !result && (
        <p
          className={cn(
            sectionSpacing,
            "border-t border-border pt-5 text-sm text-muted-foreground",
          )}
        >
          Informe um código para consultar o status e o histórico da entrega.
        </p>
      )}

      {result && (
        <div className={sectionSpacing}>
          <section className="border-y border-border py-5" aria-labelledby="tracking-summary-title">
            <h2 id="tracking-summary-title" className="sr-only">
              Resumo do rastreio
            </h2>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Código</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-foreground">
                  {result.tracking_code || codigo}
                </p>
                {result.transaction_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pedido: {result.transaction_id}
                  </p>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {result.current_status || result.status || "Aguardando atualização"}
              </span>
            </div>
          </section>

          <section className={sectionSpacing} aria-labelledby="tracking-progress-title">
            <h2
              id="tracking-progress-title"
              className="font-serif text-lg font-semibold text-foreground"
            >
              Progresso da Entrega
            </h2>
            <ol className="mt-6 grid grid-cols-3 gap-y-8 sm:grid-cols-6">
              {TRACK7_STAGES.map((stage, idx) => {
                const Icon = STAGE_ICONS[idx] ?? Package;
                const done = idx < stageIndex;
                const current = idx === stageIndex;
                const reached = done || current;
                return (
                  <li key={stage.id} className="relative flex flex-col items-center text-center">
                    {idx < TRACK7_STAGES.length - 1 && (
                      <span
                        className={cn(
                          "absolute left-[calc(50%+1.1rem)] top-5 hidden h-0.5 w-[calc(100%-2.2rem)] sm:block",
                          idx < stageIndex ? "bg-emerald-500" : "bg-border",
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-[1] flex h-10 w-10 items-center justify-center rounded-full border-2 bg-background",
                        current && "border-primary text-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]",
                        done && "border-emerald-500 text-emerald-600",
                        !reached && "border-border text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span
                      className={cn(
                        "mt-2 text-[11px] font-medium leading-tight sm:text-xs",
                        current ? "text-primary" : reached ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {stage.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={sectionSpacing} aria-labelledby="tracking-history-title">
            <div className="flex items-baseline justify-between gap-4">
              <h2
                id="tracking-history-title"
                className="font-serif text-lg font-semibold text-foreground"
              >
                Histórico
              </h2>
              <span className="text-xs text-muted-foreground">
                {timeline.length} {timeline.length === 1 ? "atualização" : "atualizações"}
              </span>
            </div>

            {timeline.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Ainda não há movimentações registradas para este envio.
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-border border-b border-t border-border">
                {timeline.map((ev, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <li
                      key={`${ev.date}-${ev.status}-${idx}`}
                      className={cn(
                        "grid gap-2 py-5 sm:grid-cols-[10rem_1fr]",
                        isLatest && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground sm:px-0">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isLatest ? "bg-primary" : "bg-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        />
                        {ev.date && <span>{ev.date}</span>}
                      </div>
                      <div className="px-1 sm:px-0">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            isLatest ? "text-primary" : "text-foreground",
                          )}
                        >
                          {ev.status}
                        </p>
                        {ev.description && ev.description !== ev.status && (
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {ev.description}
                          </p>
                        )}
                        {ev.location && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {ev.location}
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
