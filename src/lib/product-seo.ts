import { productHtmlToPlainText } from "@/lib/html-content";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Corta em limite de caracteres sem partir palavra no meio. */
export function truncateAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"), slice.lastIndexOf("."));
  if (lastBreak > max * 0.6) return slice.slice(0, lastBreak).trim();
  return slice.trim();
}

type ProductDescFields = {
  name: string;
  description?: string | null;
  short_description?: string | null;
  brand?: string | null;
  country?: string | null;
  region?: string | null;
  wine_type?: string | null;
  grape?: string | null;
};

/** Descrição legível para JSON-LD, feed XML e Merchant Center (até 5000 chars). */
export function buildProductPlainDescription(p: ProductDescFields, maxLen = 5000): string {
  // description = texto de marketing; short_description costuma ser ficha técnica em HTML.
  const longText = productHtmlToPlainText(p.description || "");
  if (longText.length >= 60) {
    return truncateAtWord(longText, maxLen);
  }

  const shortText = productHtmlToPlainText(p.short_description || "");
  if (shortText.length >= 60) {
    return truncateAtWord(shortText, maxLen);
  }

  const parts = [p.name];
  for (const [label, value] of [
    ["Marca", p.brand],
    ["País", p.country],
    ["Região", p.region],
    ["Tipo", p.wine_type],
    ["Uva", p.grape],
  ] as const) {
    if (value?.trim()) parts.push(`${label}: ${value.trim()}`);
  }
  return truncateAtWord(parts.join(". "), maxLen);
}

/** SKU/MPN válido para Google (não UUID interno). */
export function productSkuIdentifier(sku: string | null | undefined): string | undefined {
  const s = sku?.trim();
  if (!s || isUuid(s)) return undefined;
  return s;
}

/** Normaliza GTIN/EAN (8–14 dígitos) para feeds e schema. */
export function normalizeGtin(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return undefined;
}

/** Kit/Pack: não usar marca no schema nem no feed Merchant (evita fallback país/loja). */
export function isKitOrPackProductName(name: string | null | undefined): boolean {
  return /^(kit|pack)\b/i.test((name ?? "").trim());
}

/** Marca efetiva para schema/feed; Kit/Pack sem marca própria retornam null (sem fallback). */
export function resolveProductBrandName(
  name: string | null | undefined,
  brand: string | null | undefined,
  country?: string | null,
  fallback = "Galvao Vinhos",
): string | null {
  if (isKitOrPackProductName(name)) {
    const own = brand?.trim();
    return own || null;
  }
  return brand?.trim() || country?.trim() || fallback;
}
