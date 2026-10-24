import { PackageCheck, RotateCcw, CreditCard, MessageCircle } from "lucide-react";
import { useStoreSettings } from "@/lib/store-settings";
import { StoreContainer } from "@/components/store/StoreContainer";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Barra de benefícios com altura estável.
 * CSS scroll em vez de Embla — evita forced reflow de medição do carrossel.
 * Textos finais vêm do SSR (store_settings no root loader) para o bot ver o HTML completo.
 * Cada frase precisa estar coberta pelas políticas publicadas (Merchant Center).
 */
export function BenefitsBar({ className }: { className?: string }) {
  const { data: settings } = useStoreSettings();
  const maxInstallments = settings?.payments?.maxInstallments;
  const interestFree = settings?.payments?.interestFreeUpTo;
  const freeFrom = settings?.shipping?.freeShippingFrom;

  const payTitle =
    maxInstallments != null && maxInstallments > 0
      ? `Pague em até ${maxInstallments}x`
      : "Pague no cartão";
  const payText =
    maxInstallments != null && maxInstallments > 0
      ? interestFree != null && interestFree >= maxInstallments
        ? "Sem juros no cartão"
        : interestFree != null && interestFree >= 1
          ? `1x sem juros · até ${maxInstallments}x com juros`
          : `Até ${maxInstallments}x com juros`
      : "Parcelamento disponível";

  const items = [
    {
      id: "freight",
      icon: PackageCheck,
      title: "Frete para todo Brasil",
      text: freeFrom != null && freeFrom > 0 ? `Grátis acima de ${brl(freeFrom)}` : "Valor calculado pelo CEP",
    },
    { id: "card", icon: CreditCard, title: payTitle, text: payText },
    {
      id: "returns",
      icon: RotateCcw,
      title: "7 dias para desistir",
      text: "Contados do recebimento",
    },
    {
      id: "support",
      icon: MessageCircle,
      title: "Atendimento",
      text: "Segunda a sexta, 8h às 18h",
    },
  ] as const;

  return (
    <section className={cn("border-b border-border/70 bg-background", className)}>
      <StoreContainer className="py-4">
        <ul
          className="flex gap-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-4 xl:overflow-visible"
          aria-label="Benefícios da loja"
        >
          {items.map(({ id, icon: Icon, title, text }) => (
            <li
              key={id}
              className="flex min-h-11 w-[82%] shrink-0 items-center gap-3 border-r border-border/60 pr-5 last:border-r-0 sm:w-1/2 sm:px-5 xl:w-auto xl:min-w-0 xl:px-5"
            >
              <Icon className="h-6 w-6 shrink-0 text-primary" strokeWidth={1.45} aria-hidden />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
                  {title}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{text}</div>
              </div>
            </li>
          ))}
        </ul>
      </StoreContainer>
    </section>
  );
}
