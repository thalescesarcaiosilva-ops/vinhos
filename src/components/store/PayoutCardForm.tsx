import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPayoutPublicConfig } from "@/lib/payoutbr.functions";
import { CreditCard, Loader2 } from "lucide-react";
import type { InstallmentPlanItem } from "@/lib/installments";

export type PayoutCardHandle = {
  submit: (createTransaction: (token: string) => Promise<any>) => Promise<any>;
  ready: boolean;
  valid: boolean;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function maskCardNumber(value: string) {
  const digits = onlyDigits(value).slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskExpiry(value: string) {
  const digits = onlyDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

// Traduz as mensagens técnicas de validação da PayoutBR para algo amigável em pt-BR.
function translateCardError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("number") && (m.includes("only numbers") || m.includes("no spaces"))) return "Número do cartão inválido.";
  if (m.includes("number") && m.includes("required")) return "Informe o número do cartão.";
  if (m.includes("holdername")) return "Informe o nome impresso no cartão.";
  if (m.includes("expirationmonth")) return "Mês de validade do cartão inválido.";
  if (m.includes("expirationyear")) return "Ano de validade do cartão inválido.";
  if (m.includes("cvv") || m.includes("cvc")) return "Código de segurança (CVV) inválido.";
  if (m.includes("expired")) return "Cartão expirado.";
  return message;
}

function formatPayoutError(json: { message?: unknown; error?: unknown }, fallback: string) {
  const raw = json?.message ?? json?.error;
  if (Array.isArray(raw)) {
    const parts = raw.filter((x) => typeof x === "string").map((x) => translateCardError(x as string));
    return [...new Set(parts)].join(" ") || fallback;
  }
  if (typeof raw === "string" && raw.trim()) return translateCardError(raw);
  return fallback;
}

// A API responde o token como uma string JSON pura (ex.: "VTJGc2RH...").
// Precisamos remover as aspas externas — se enviarmos o texto cru com aspas,
// o token fica inválido/frágil na criação da transação.
function parseCardToken(text: string): string {
  const trimmed = text.trim();
  try {
    const json = JSON.parse(trimmed);
    if (typeof json === "string") return json.trim();
    const value = json?.token ?? json?.hash ?? json?.card_hash ?? json?.data;
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* resposta não era JSON, usa o texto cru abaixo */
  }
  return trimmed.replace(/^"|"$/g, "");
}

async function tokenizeCard(
  apiUrl: string,
  publicKey: string,
  card: { number: string; holderName: string; expirationMonth: number; expirationYear: number; cvv: string },
) {
  const url = `${apiUrl}/card-token?publicKey=${encodeURIComponent(publicKey.trim())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/plain" },
    body: JSON.stringify(card),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "Não foi possível validar o cartão. Confira os dados e tente novamente.";
    try {
      message = formatPayoutError(JSON.parse(text), message);
    } catch {
      if (text) message = translateCardError(text.slice(0, 200));
    }
    throw new Error(message);
  }
  const token = parseCardToken(text);
  if (!token) throw new Error("Não foi possível gerar o token do cartão. Tente novamente.");
  return token;
}

export function PayoutCardForm({
  onReadyChange,
  onValidChange,
  onError,
  registerHandle,
  installments,
  setInstallments,
  maxInstallments = 6,
  plan,
}: {
  onReadyChange?: (ready: boolean) => void;
  onValidChange?: (valid: boolean) => void;
  onError?: (msg: string) => void;
  registerHandle: (h: PayoutCardHandle) => void;
  installments: number;
  setInstallments: (n: number) => void;
  maxInstallments?: number;
  plan?: InstallmentPlanItem[];
}) {
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const fetchConfig = useServerFn(getPayoutPublicConfig);

  const expDigits = onlyDigits(expiry);
  const expMonth = expDigits.slice(0, 2);
  const expYearRaw = expDigits.slice(2);
  const expYear = expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw;
  const valid =
    onlyDigits(number).length >= 13 &&
    holder.trim().length >= 3 &&
    expMonth.length === 2 &&
    expYear.length === 4 &&
    onlyDigits(cvv).length >= 3;

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (!cfg.publicKey) throw new Error("PAYOUTBR_PUBLIC_KEY não configurada");
        setLoading(false);
        onReadyChange?.(true);
      } catch (e: any) {
        setErr(e?.message ?? "Falha ao iniciar pagamento por cartão");
        setLoading(false);
        onError?.(e?.message ?? "Falha ao iniciar pagamento por cartão");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onValidChange?.(valid);
  }, [valid, onValidChange]);

  useEffect(() => {
    registerHandle({
      ready: !loading,
      valid,
      submit: async (createTransaction) => {
        const cfg = await fetchConfig();
        if (!cfg.publicKey) throw new Error("PAYOUTBR_PUBLIC_KEY não configurada");
        const token = await tokenizeCard(cfg.apiUrl, cfg.publicKey, {
          number: onlyDigits(number),
          holderName: holder.trim().toUpperCase(),
          expirationMonth: Number(expMonth),
          expirationYear: Number(expYear),
          cvv: onlyDigits(cvv),
        });
        return createTransaction(token);
      },
    });
  }, [loading, valid, number, holder, expMonth, expYear, cvv, registerHandle, fetchConfig]);

  const inp =
    "w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <CreditCard className="mr-1 inline h-3.5 w-3.5" />
        Dados do cartão
      </label>
      <div className="space-y-3 rounded-sm border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando pagamento seguro...
          </div>
        ) : (
          <>
            <input
              value={number}
              onChange={(e) => setNumber(maskCardNumber(e.target.value))}
              placeholder="Número do cartão"
              inputMode="numeric"
              autoComplete="cc-number"
              className={inp}
            />
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Nome impresso no cartão"
              autoComplete="cc-name"
              className={inp}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={expiry}
                onChange={(e) => setExpiry(maskExpiry(e.target.value))}
                placeholder="MM/AA"
                inputMode="numeric"
                autoComplete="cc-exp"
                className={inp}
              />
              <input
                value={cvv}
                onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                placeholder="CVV"
                inputMode="numeric"
                autoComplete="cc-csc"
                className={inp}
              />
            </div>
          </>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-destructive">{err}</p>}

      <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Parcelas
      </label>
      <select
        value={installments}
        onChange={(e) => setInstallments(Number(e.target.value))}
        className="w-full rounded-sm border border-border bg-card px-3 py-2 text-sm"
      >
        {(plan && plan.length > 0
          ? plan.map((p) => ({
              n: p.n,
              label: `${p.n}x de R$ ${p.value.toFixed(2).replace(".", ",")} ${p.hasInterest ? `(R$ ${p.total.toFixed(2).replace(".", ",")} total)` : "sem juros"}`,
            }))
          : Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => ({ n, label: `${n}x sem juros` }))
        ).map((o) => (
          <option key={o.n} value={o.n}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
