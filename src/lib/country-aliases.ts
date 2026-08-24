/** Valores de `products.country` no banco → label canônico (countries.ts). */
export const COUNTRY_DB_TO_LABEL: Record<string, string> = {
  EUA: "Estados Unidos",
  USA: "Estados Unidos",
  eua: "Estados Unidos",
};

/** Labels canônicos → valores possíveis no banco (para filtrar coleção). */
export const COUNTRY_LABEL_TO_DB: Record<string, string[]> = {
  "Estados Unidos": ["Estados Unidos", "EUA", "USA", "eua"],
};

export function canonicalCountryLabel(raw: string): string {
  const t = raw.trim();
  return COUNTRY_DB_TO_LABEL[t] ?? t;
}

/** Valores de country a usar em `.in("country", …)` na coleção. */
export function countryDbValuesForLabel(label: string): string[] {
  return COUNTRY_LABEL_TO_DB[label] ?? [label];
}
