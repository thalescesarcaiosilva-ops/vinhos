import { STORE } from "@/lib/settings";
import { telHref } from "@/lib/contact-links";

/** Telefone da loja com link tel:. */
export function StoreContactNumbers({
  phone,
}: {
  phone?: string | null;
  /** Mantido por compatibilidade; ícone de WhatsApp foi removido. */
  showIcon?: boolean;
}) {
  const displayPhone = phone?.trim() || STORE.phone;
  const href = telHref(displayPhone) ?? `tel:+55${STORE.phoneDigits}`;
  return (
    <a href={href} className="text-sm font-semibold text-foreground hover:text-primary">
      Telefone: {displayPhone}
    </a>
  );
}
