const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** Converte HTML em texto puro (meta tags, compartilhamento, etc.). */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    text = text.replaceAll(entity, char);
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const DESCRIPTION_BOILERPLATE_LINE =
  /^(mais detalhes|descri[cç][aã]o|descri[cç][aã]o t[eé]cnica|ficha t[eé]cnica|especifica[cç][oõ]es|caracter[ií]sticas|v[ií]deos?|avalia[cç][oõ]es)$/i;

/** Remove rótulos de abas (Magazord/Vinoteca) antes de gerar texto para feeds e SEO. */
export function productHtmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const normalized = normalizeProductDescription(html);
  const cleaned = normalized
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<ul[^>]*\bnav\b[^>]*>[\s\S]*?<\/ul>/gi, "");
  let text = htmlToPlainText(cleaned);
  text = text
    .replace(/^mais detalhes\s+descri[cç][aã]o\s+/i, "")
    .replace(/^descri[cç][aã]o\s+/i, "");
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !DESCRIPTION_BOILERPLATE_LINE.test(l));
  return lines.join("\n\n").trim();
}

/** Normaliza HTML importado (WooCommerce/Magazord): remove \\n literal e markup ruidoso. */
export function normalizeProductDescription(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/<hr[^>]*>/gi, "\n")
    .replace(/<div[^>]*style="[^"]*font-family:\s*Arial[^"]*"[^>]*>/gi, "")
    .replace(/<\/div>\s*$/gi, "")
    .trim();
}

/** Texto legível para exibição quando o HTML é pobre ou importado. */
export function formatProductDescription(html: string | null | undefined): string {
  return productHtmlToPlainText(normalizeProductDescription(html));
}

/** Indica se vale renderizar como HTML sanitizado ou texto simples. */
export function isRichProductHtml(html: string | null | undefined): boolean {
  const normalized = normalizeProductDescription(html);
  return /<(p|div|h[1-6]|table|ul|ol|address)\b/i.test(normalized);
}

/** Remove tags perigosas; mantém formatação básica do catálogo importado. */
export function sanitizeProductHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
