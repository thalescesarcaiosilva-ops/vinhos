import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupTrack7Tracking } from "@/lib/track7.functions";
import type { Track7TrackingData } from "@/lib/track7";
import { cn } from "@/lib/utils";

type Props = {
  initialCode?: string;
  /** Quando true, ajusta os espaços para uso dentro da área da conta. */
  embedded?: boolean;
};

export function TrackOrderPanel({ initialCode = "", embedded = false }: Props) {
  const lookup = useServerFn(lookupTrack7Tracking);
  const [codigo, setCodigo] = useState(initialCode.trim());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Track7TrackingData | null>(null);

  useEffect(() => {
    const code = initialCode.trim();
    if (!code) return;
    setCodigo(code);
    void buscar(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando initialCode muda
  }, [initialCode]);

  async function buscar(raw?: string) {
    const value = (raw ?? codigo).trim();
    if (!value || value.length < 2) {
      setError("Digite um código de rastreio válido.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await lookup({
        data: { trackingCode: value.toUpperCase() },
      });
      if (!res.ok) {
        setResult(null);
        setError(res.error);
        return;
      }
      setResult(res.data);
    } catch (error: unknown) {
      setResult(null);
      setError(error instanceof Error ? error.message : "Não foi possível consultar o rastreio.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void buscar();
  }

  const timeline = [...(result?.events ?? [])].reverse();
  const sectionSpacing = embedded ? "mt-6" : "mt-8";

  return (
    <div aria-busy={loading}>
      <form onSubmit={onSubmit}>
        <Label htmlFor="codigoRastreamento" className="text-sm text-foreground">
          Código de rastreamento
        </Label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            id="codigoRastreamento"
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ex.: PQA5961518202BR"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tracking-error" : "tracking-help"}
            className="h-11 rounded-sm bg-background text-sm uppercase tracking-wide shadow-none placeholder:normal-case placeholder:tracking-normal"
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
                  {result.tracking_code || codigo.toUpperCase()}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {result.current_status || result.status || "Em andamento"}
              </span>
            </div>
            {result.transaction_id && (
              <p className="mt-3 text-xs text-muted-foreground">
                Pedido: <span className="font-medium text-foreground">{result.transaction_id}</span>
              </p>
            )}
          </section>

          <section className={sectionSpacing} aria-labelledby="tracking-history-title">
            <div className="flex items-baseline justify-between gap-4">
              <h2
                id="tracking-history-title"
                className="font-serif text-xl font-semibold text-foreground"
              >
                Histórico
              </h2>
              <span className="text-xs text-muted-foreground">
                {timeline.length} {timeline.length === 1 ? "atualização" : "atualizações"}
              </span>
            </div>
            {timeline.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Ainda não há movimentações registradas para este código.
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-border border-b border-t border-border">
                {timeline.map((ev, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <li
                      key={`${ev.date}-${ev.status}-${idx}`}
                      className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]"
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isLatest ? "bg-primary" : "bg-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        />
                        {ev.date && <span>{ev.date}</span>}
                      </div>
                      <div>
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            isLatest ? "text-primary" : "text-foreground",
                          )}
                        >
                          {ev.status}
                        </p>
                        {ev.description && (
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {ev.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {ev.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {ev.location}
                            </span>
                          )}
                        </div>
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
