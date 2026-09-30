import { STORE } from "@/lib/settings";

/** Monta href tel: a partir de telefone BR (com ou sem +55). */
export function telHref(phone: string | null | undefined): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("55") && digits.length >= 12) return `tel:+${digits}`;
  return `tel:+55${digits}`;
}

export function mailtoHref(email: string | null | undefined): string | undefined {
  const trimmed = (email ?? "").trim();
  if (!trimmed || !trimmed.includes("@")) return undefined;
  return `mailto:${trimmed}`;
}

const EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
/** Telefone BR comum: (71) 99937-4325 ou variantes. */
const PHONE_RE = /(?<!\d)\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}(?!\d)/g;

/**
 * Converte e-mails e telefones em âncoras mailto:/tel: no HTML das políticas.
 * Preserva o restante do texto (incluindo quebras de linha via whitespace-pre-wrap).
 */
function digitsOf(value: string) {
  return value.replace(/\D/g, "");
}

function isStorePhoneDigits(digits: string) {
  const store = STORE.phoneDigits;
  if (!store || !digits) return false;
  return digits === store || digits === `55${store}` || digits.endsWith(store);
}

function whatsappLine() {
  return `<a href="https://wa.me/${STORE.whatsappNumber}" target="_blank" rel="noopener noreferrer">WhatsApp: ${STORE.whatsappDisplay}</a>\n`;
}

function alreadyHasWhatsapp(html: string, offset: number) {
  return html.slice(Math.max(0, offset - 180), offset).includes(`wa.me/${STORE.whatsappNumber}`);
}

function isInsideTag(html: string, index: number) {
  const before = html.slice(0, index);
  return before.lastIndexOf("<") > before.lastIndexOf(">");
}

function isInsideAnchor(html: string, index: number) {
  const before = html.slice(0, index);
  return before.lastIndexOf("<a") > before.lastIndexOf("</a>");
}

export function linkifyContactHtml(content: string): string {
  if (!content) return "";

  let html = content;

  html = html.replace(
    /((?:Telefone|Tel\.?)\s*:\s*)(\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4})/gi,
    (full, label: string, phone: string, offset: number, source: string) => {
      if (isInsideTag(source, offset) || isInsideAnchor(source, offset)) return full;
      if (!isStorePhoneDigits(digitsOf(phone))) return full;
      if (alreadyHasWhatsapp(source, offset)) return `${label}${phone}`;
      return `${whatsappLine()}${label}${phone}`;
    },
  );

  html = html.replace(
    /((?:Telefone|Tel\.?)\s*:\s*)?<a\b[^>]*href=["']tel:[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi,
    (full, label: string | undefined, inner: string, offset: number, source: string) => {
      const text = inner.replace(/<[^>]+>/g, "");
      const hrefMatch = full.match(/href=["']tel:([^"']+)["']/i);
      if (!isStorePhoneDigits(digitsOf(`${hrefMatch?.[1] ?? ""}${text}`))) return full;
      const phoneText = `${label ?? ""}${text}`;
      if (alreadyHasWhatsapp(source, offset)) return phoneText;
      return `${whatsappLine()}${phoneText}`;
    },
  );

  if (!/<a\s[^>]*href=["']mailto:/i.test(html)) {
    html = html.replace(EMAIL_RE, (email) => `<a href="mailto:${email}">${email}</a>`);
  }

  return html.replace(PHONE_RE, (phone: string, offset: number, source: string) => {
    if (isInsideTag(source, offset) || isInsideAnchor(source, offset)) return phone;
    if (isStorePhoneDigits(digitsOf(phone))) {
      if (alreadyHasWhatsapp(source, offset)) return phone;
      return `${whatsappLine()}${phone}`;
    }
    const href = telHref(phone);
    if (!href) return phone;
    return `<a href="${href}">${phone}</a>`;
  });
}
