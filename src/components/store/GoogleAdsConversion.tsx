import { useEffect } from "react";
import { useStoreSettings } from "@/lib/store-settings";
import { fireGoogleAdsConversion, normalizeAdsSendTo } from "@/lib/analytics";

/**
 * Dispara a conversão do Google Ads na página de obrigado (pagamento confirmado).
 * Gerar o Pix não é uma conversão — só a venda efetivada conta.
 * O dedupe por pedido (sessionStorage + memória) garante um único disparo por orderId,
 * mesmo que a página de obrigado seja revisitada/recarregada.
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
