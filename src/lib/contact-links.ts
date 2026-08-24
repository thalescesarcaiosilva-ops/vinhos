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
const PHONE_RE = /(\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4})/g;

/**
 * Converte e-mails e telefones em âncoras mailto:/tel: no HTML das políticas.
 * Preserva o restante do texto (incluindo quebras de linha via whitespace-pre-wrap).
 */
export function linkifyContactHtml(content: string): string {
  if (!content) return "";
  // Conteúdo já com âncoras de contato — não reprocessar.
  if (/<a\s[^>]*href=["'](?:mailto:|tel:)/i.test(content)) return content;

  const withEmails = content.replace(EMAIL_RE, (email) => {
    return `<a href="mailto:${email}">${email}</a>`;
  });
  return withEmails.replace(PHONE_RE, (phone) => {
    const href = telHref(phone);
    if (!href) return phone;
    return `<a href="${href}">${phone}</a>`;
  });
}
