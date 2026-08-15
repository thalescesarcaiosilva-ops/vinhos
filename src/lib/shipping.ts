import { DEFAULT_SETTINGS, type ShippingRegion, type ShippingSettings } from "./store-settings";

export type ShippingQuote = {
  label: string;
  price: number;
  eta: string;
};

/** Map first 2 digits of CEP to UF — fallback when ViaCEP not consulted */
export function ufFromCep(cep: string): string | null {
  const c = cep.replace(/\D/g, "");
  if (c.length < 2) return null;
  const n = Number(c.slice(0, 2));
  if (n >= 1 && n <= 19) return "SP";
  if (n >= 20 && n <= 28) return "RJ";
  if (n === 29) return "ES";
  if (n >= 30 && n <= 39) return "MG";
  if (n >= 40 && n <= 48) return "BA";
  if (n === 49) return "SE";
  if (n >= 50 && n <= 56) return "PE";
  if (n === 57) return "AL";
  if (n === 58) return "PB";
  if (n === 59) return "RN";
  if (n >= 60 && n <= 63) return "CE";
  if (n === 64) return "PI";
  if (n === 65) return "MA";
  if (n >= 66 && n <= 68) return "PA";
  if (n === 69) return "AM";
  if (n >= 70 && n <= 73) return "DF";
  if (n >= 74 && n <= 76) return "GO";
  if (n === 77) return "TO";
  if (n === 78) return "MT";
  if (n === 79) return "MS";
  if (n >= 80 && n <= 87) return "PR";
  if (n >= 88 && n <= 89) return "SC";
  if (n >= 90 && n <= 99) return "RS";
  return null;
}

function matchRegion(regions: ShippingRegion[], uf: string | null): ShippingRegion | null {
  if (!uf) return null;
  return regions.find((r) => r.ufs.includes(uf)) ?? null;
}

export function calcShipping(
  subtotal: number,
  cep: string,
  settings: ShippingSettings = DEFAULT_SETTINGS.shipping,
  uf?: string | null,
): ShippingQuote[] {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return [];
  const finalUf = uf ?? ufFromCep(clean);
  const region = matchRegion(settings.regions ?? [], finalUf);
  const threshold = region?.freeShippingFrom ?? settings.freeShippingFrom;
  const factor = region?.priceFactor ?? 1;
  const extra = region?.extraDays ?? 0;

  return (settings.methods ?? [])
    .filter((m) => m.enabled)
    .map((m) => {
      const price = subtotal >= threshold ? 0 : Math.round(m.price * factor * 100) / 100;
      const min = m.etaMinDays + extra;
      const max = m.etaMaxDays + extra;
      const eta = min === max ? `${min} dia${min === 1 ? "" : "s"} útil${min === 1 ? "" : "eis"}` : `${min}–${max} dias úteis`;
      return { label: m.label, price, eta };
    });
}
