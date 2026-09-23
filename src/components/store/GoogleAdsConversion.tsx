import { useEffect } from "react";
import { useStoreSettings } from "@/lib/store-settings";
import { fireGoogleAdsConversion, normalizeAdsSendTo } from "@/lib/analytics";

/**
 * Dispara a conversão do Google Ads ao gerar o Pix (pedido criado).
 * Não dispara na página de obrigado — a conversão conta no momento da intenção
 * de compra (Pix gerado), não no pagamento confirmado.
 * O dedupe por pedido (sessionStorage + memória) garante um único disparo por orderId,
 * mesmo que a tela do Pix seja revisitada/restaurada após reload.
 * Pageviews continuam automáticos via gtag — este é o único evento customizado.
 */
export function GoogleAdsConversion({
  orderId,
  value,
  currency = "BRL",
}: {
  orderId: string;
  value: number;
  currency?: string;
}) {
  const { data: settings } = useStoreSettings();
  const sendTo = normalizeAdsSendTo(settings?.tracking?.googleAdsConversionSendTo);

  useEffect(() => {
    if (!sendTo || !orderId) return;
    fireGoogleAdsConversion({
      sendTo,
      value,
      transactionId: orderId,
      currency,
    });
  }, [sendTo, orderId, value, currency]);

  return null;
}
