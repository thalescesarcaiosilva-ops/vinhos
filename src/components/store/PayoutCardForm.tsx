import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
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

/**
 * Formulário de cartão + parcelas (UI).
 * Cobrança por cartão está desligada — use Pix no checkout.
 */
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
    onReadyChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onValidChange?.(valid);
  }, [valid, onValidChange]);

  useEffect(() => {
    registerHandle({
      ready: true,
      valid,
      submit: async () => {
        const msg = "Pagamento por cartão indisponível no momento. Use Pix.";
        onError?.(msg);
        throw new Error(msg);
      },
    });
  }, [valid, registerHandle, onError]);

  const inp =
    "w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <CreditCard className="mr-1 inline h-3.5 w-3.5" />
        Dados do cartão
      </label>
      <div className="space-y-3 rounded-sm border border-border bg-card p-4">
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
      </div>

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
          : Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => ({
              n,
              label: `${n}x sem juros`,
            }))
        ).map((o) => (
          <option key={o.n} value={o.n}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
