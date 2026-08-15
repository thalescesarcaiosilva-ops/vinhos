export const brl = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
};

export const installments = (price: number, n = 6) =>
  `ou ${n}x de ${brl(price / n)} sem juros`;
