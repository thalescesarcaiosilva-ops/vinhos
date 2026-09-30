import { WhatsAppIcon } from "@/components/store/WhatsAppIcon";
import { STORE } from "@/lib/settings";

/** WhatsApp com link na frente; o telefone da loja continua visível, sem link. */
export function StoreContactNumbers({
  phone,
  showIcon = false,
}: {
  phone?: string | null;
  showIcon?: boolean;
}) {
  const displayPhone = phone?.trim() || STORE.phone;
  return (
    <span className="inline-flex flex-col items-start gap-1 text-sm">
      <a
        href={`https://wa.me/${STORE.whatsappNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary"
      >
        {showIcon ? <WhatsAppIcon className="h-4 w-4 shrink-0 text-[#25D366]" /> : null}
        WhatsApp: {STORE.whatsappDisplay}
      </a>
      <span className="text-muted-foreground">Telefone: {displayPhone}</span>
    </span>
  );
}
