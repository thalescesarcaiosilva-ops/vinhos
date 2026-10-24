import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Truck } from "lucide-react";
import { brl } from "@/lib/format";
import { calcShipping, type ShippingQuote } from "@/lib/shipping";
import { fetchAddressByCEP, maskCEP } from "@/lib/validation";
import type { ShippingSettings } from "@/lib/store-settings";

const CEP_STORAGE_KEY = "galvao_last_cep";

type Props = {
  subtotal: number;
  shipping: ShippingSettings | undefined;
};

export function ProductShippingCalculator({ subtotal, shipping }: Props) {
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [place, setPlace] = useState<{ city: string; state: string } | null>(null);
  const lastCalculated = useRef<string | null>(null);

  async function calculate(value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length !== 8) {
      setError("Digite os 8 números do CEP");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const addr = await fetchAddressByCEP(value);
      setPlace(addr ? { city: addr.city, state: addr.state } : null);
      const result = calcShipping(subtotal, value, shipping, addr?.state);
      if (result.length === 0) {
        setQuotes(null);
        setError("Não entregamos neste CEP no momento");
        return;
      }
      setQuotes(result);
      lastCalculated.current = `${clean}:${subtotal}`;
      try {
        localStorage.setItem(CEP_STORAGE_KEY, clean);
      } catch {
        /* sem storage, segue sem lembrar o CEP */
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CEP_STORAGE_KEY);
      if (saved && saved.length === 8) {
        const masked = maskCEP(saved);
        setCep(masked);
        void calculate(masked);
      }
    } catch {
      /* sem storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const clean = cep.replace(/\D/g, "");
    if (!quotes || clean.length !== 8) return;
    if (lastCalculated.current === `${clean}:${subtotal}`) return;
    void calculate(cep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  function onChange(value: string) {
    const masked = maskCEP(value);
    setCep(masked);
    setError(null);
    const clean = masked.replace(/\D/g, "");
    if (clean.length < 8) {
      setQuotes(null);
      setPlace(null);
      return;
    }
    if (lastCalculated.current !== `${clean}:${subtotal}`) void calculate(masked);
  }

  return (
    <section className="rounded-md border border-border bg-card p-4" aria-labelledby="shipping-title">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.7} aria-hidden />
        <h2 id="shipping-title" className="text-sm font-bold text-foreground">
          Frete e prazo de entrega
        </h2>
      </div>

      <form
        className="mt-3 flex h-11 overflow-hidden rounded-md border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        onSubmit={(e) => {
          e.preventDefault();
          void calculate(cep);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">CEP</span>
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            enterKeyHint="go"
            value={cep}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Digite seu CEP"
            className="h-full w-full bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground/70 sm:text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="flex min-w-24 items-center justify-center gap-1.5 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loading ? "" : "Calcular"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : place ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
            {place.city} / {place.state}
          </span>
        ) : (
          <span />
        )}
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground underline underline-offset-2 hover:text-primary"
        >
          Não sei meu CEP
        </a>
      </div>

      {quotes && (
        <ul className="mt-3 space-y-2">
          {quotes.map((q) => (
            <li
              key={q.label}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{q.eta} após o envio</p>
                <p className="truncate text-xs text-muted-foreground">{q.label}</p>
              </div>
              <span
                className={`shrink-0 text-sm font-bold ${q.price === 0 ? "text-[color:var(--buy)]" : "text-foreground"}`}
              >
                {q.price === 0 ? "Grátis" : brl(q.price)}
              </span>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}
