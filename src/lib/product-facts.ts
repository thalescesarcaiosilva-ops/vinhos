/**
 * Fatos logo abaixo do nome.
 * Só entra o que dá para afirmar. Dado ausente não vira aviso, link de dúvida nem validade.
 */
export type ProductFactSource = {
  name: string;
  product_type?: string | null;
  wine_type?: string | null;
  vintage?: string | null;
  volume_ml?: number | null;
  alcohol_content?: string | null;
  shelf_life?: string | null;
  description?: string | null;
  short_description?: string | null;
};

export type KeyFact = {
  label: string;
  value: string;
};

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKit(product: ProductFactSource): boolean {
  return product.product_type === "kit" || /^kit\b/i.test(product.name);
}

export function formatVolume(ml: number): string {
  if (ml >= 1000) {
    const liters = ml / 1000;
    const text = Number.isInteger(liters)
      ? String(liters)
      : liters.toFixed(2).replace(/0$/, "").replace(".", ",");
    return `${text} L`;
  }
  return `${ml} ml`;
}

type ParsedVolume = { ml: number };

function pushVolume(volumes: ParsedVolume[], ml: number) {
  if (!Number.isFinite(ml) || ml <= 0 || ml > 20000) return;
  if (volumes.some((item) => item.ml === ml)) return;
  volumes.push({ ml });
}

function extractVolumes(text: string): ParsedVolume[] {
  const volumes: ParsedVolume[] = [];
  const source = plainText(text);
  for (const match of source.matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|cl|lts?|litros?|l)\b/gi)) {
    const amount = Number(match[1].replace(",", "."));
    const unit = match[2].toLowerCase();
    if (unit === "ml") pushVolume(volumes, Math.round(amount));
    else if (unit === "cl") pushVolume(volumes, Math.round(amount * 10));
    else pushVolume(volumes, Math.round(amount * 1000));
  }
  for (const match of source.matchAll(/\b(187|375|500|750|1000)\s*m\b/gi)) {
    pushVolume(volumes, Number(match[1]));
  }
  return volumes;
}

function statedVolumes(product: ProductFactSource): ParsedVolume[] {
  return extractVolumes(
    [product.name, product.short_description, product.description].map(plainText).join("\n"),
  );
}

function isSparkling(product: ProductFactSource): boolean {
  const blob = `${product.name} ${product.product_type ?? ""} ${product.wine_type ?? ""}`;
  return (
    product.product_type === "espumante" ||
    /espumante|champagne|prosecco|\bcava\b|frisante|\bbrut\b/i.test(blob)
  );
}

/** Volume em ml já gravado, ou o que está escrito no nome. Sem texto de ressalva. */
function volumeLabel(product: ProductFactSource): string | null {
  const stated = statedVolumes(product);
  const stored = Number(product.volume_ml ?? 0);
  const kit = isKit(product);
  const magnum = /magnum|magnun/i.test(product.name);

  if (stated.length > 0) {
    const labels = stated.map((item) => formatVolume(item.ml));
    if (kit && magnum && stated.length === 1 && stated[0].ml >= 1500) {
      return `750 ml por garrafa · ${labels[0]}`;
    }
    if (kit && stated.length === 1 && stated[0].ml <= 1000) {
      return `${labels[0]} por garrafa`;
    }
    if (kit && stated.length === 1) return labels[0];
    return labels.join(" · ");
  }

  if (stored > 0) {
    if (kit && magnum && stored >= 1500) return `750 ml por garrafa · ${formatVolume(stored)}`;
    if (kit) return `${formatVolume(stored)} por garrafa`;
    return formatVolume(stored);
  }

  return null;
}

function vintageLabel(product: ProductFactSource): string | null {
  // Espumante sem safra no rótulo é mistura de anos. Não exibimos safra nesse tipo.
  if (isSparkling(product)) return null;
  const stored = product.vintage?.trim() ?? "";
  if (stored && !/consult|varia|não inform|nao inform|safra a confirmar|sob consulta/i.test(stored)) {
    return stored;
  }
  const years = [...product.name.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => match[1]);
  const unique = [...new Set(years)];
  if (unique.length === 0) return null;
  if (product.product_type === "destilado" || product.product_type === "gourmet") return null;
  return unique.join("/");
}

function cellarLabel(product: ProductFactSource): string | null {
  if (isSparkling(product)) return null;
  const text = product.shelf_life?.trim() ?? "";
  if (!text) return null;
  if (/validade|v[aá]lid|vence|venciment|expir|consult|lote/i.test(text)) return null;
  return text;
}

export function productKeyFacts(product: ProductFactSource): KeyFact[] {
  const facts: KeyFact[] = [];
  const volume = volumeLabel(product);
  if (volume) facts.push({ label: "Volume", value: volume });

  const vintage = vintageLabel(product);
  if (vintage) facts.push({ label: "Safra", value: vintage });

  const alcohol = product.alcohol_content?.trim();
  if (alcohol && !/consult|n[aã]o inform/i.test(alcohol)) {
    facts.push({ label: "Teor alcoólico", value: alcohol });
  }

  const cellar = cellarLabel(product);
  if (cellar) facts.push({ label: "Potencial de guarda", value: cellar });

  return facts;
}
