import { PackageCheck, ShieldCheck, CreditCard, MessageCircle } from "lucide-react";
import { useStoreSettings } from "@/lib/store-settings";
import { StoreContainer } from "@/components/store/StoreContainer";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";

/** Barra de benefícios com altura/keys estáveis — evita CLS ao chegar o parcelamento real. */
export function BenefitsBar() {
  const { data: settings } = useStoreSettings();
  const maxInstallments = settings?.payments?.maxInstallments;
  const interestFree = settings?.payments?.interestFreeUpTo;

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
      text: "Embalagem segura e térmica",
    },
    { id: "card", icon: CreditCard, title: payTitle, text: payText },
    {
      id: "secure",
      icon: ShieldCheck,
      title: "Compra 100% segura",
      text: "Garantia de procedência",
    },
    {
      id: "support",
      icon: MessageCircle,
      title: "Atendimento especializado",
      text: "Sommelier à disposição",
    },
  ] as const;

  return (
    <section className="border-b border-border/70 bg-background">
      <StoreContainer className="py-4">
        <Carousel opts={{ align: "start", dragFree: true }} aria-label="Benefícios da loja">
          <CarouselContent className="-ml-0">
            {items.map(({ id, icon: Icon, title, text }) => (
              <CarouselItem
                key={id}
                className="basis-[82%] border-r border-border/60 pl-0 pr-5 sm:basis-1/2 sm:px-5 lg:basis-1/4"
              >
                <div className="flex min-h-11 items-center gap-3">
                  <Icon className="h-6 w-6 shrink-0 text-primary" strokeWidth={1.45} aria-hidden />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
                      {title}
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{text}</div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </StoreContainer>
    </section>
  );
}
