/** Taxa total (%) cobrada no valor do pedido para aquela quantidade de parcelas. */
export type InstallmentRates = Record<string, number>;

export type InstallmentPlanInput = {
  maxInstallments: number;
  minInstallment: number;
  interestFreeUpTo: number;
  installmentRates?: InstallmentRates;
};

export type InstallmentPlanItem = {
  n: number;
  value: number;
  total: number;
  hasInterest: boolean;
  rate: number;
};

export const DEFAULT_INSTALLMENT_RATES: InstallmentRates = {
  "2": 23,
  "3": 23.96,
  "4": 24.9,
  "5": 25.94,
  "6": 26.3,
};

export function mergeInstallmentRates(raw?: InstallmentRates | null): InstallmentRates {
  return { ...DEFAULT_INSTALLMENT_RATES, ...(raw ?? {}) };
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/** Taxa total (%) da parcela n. 0 = sem juros. */
export function installmentRateFor(n: number, p: InstallmentPlanInput): number {
  if (n <= (p.interestFreeUpTo || 1)) return 0;
  const keyed = p.installmentRates?.[String(n)];
  if (typeof keyed === "number" && Number.isFinite(keyed) && keyed > 0) return keyed;
  return 0;
}

/** Plano de parcelas: 1x sem juros; 2x–Nx com taxa total sobre o valor do pedido. */
export function installmentPlan(cardPrice: number, p: InstallmentPlanInput): InstallmentPlanItem[] {
  const out: InstallmentPlanItem[] = [];
  const max = Math.max(1, Math.floor(p.maxInstallments || 1));
  for (let n = 1; n <= max; n++) {
    const rate = installmentRateFor(n, p);
    if (n > (p.interestFreeUpTo || 1) && rate <= 0) continue;
    const hasInterest = rate > 0;
    const total = hasInterest ? roundMoney(cardPrice * (1 + rate / 100)) : roundMoney(cardPrice);
    const value = roundMoney(total / n);
    if (value < p.minInstallment && n > 1) break;
    out.push({ n, value, total, hasInterest, rate });
  }
  return out;
}
