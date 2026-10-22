import { useEffect } from "react";
import { useStoreSettings } from "@/lib/store-settings";
import { fireGoogleAdsConversion, normalizeAdsSendTo } from "@/lib/analytics";

/**
 * Tag de conversão do Google Ads.
 * Sem `paid`: dispara na tela do Pix, quando o pedido é gerado.
 * Com `paid`: dispara só na tela de pagamento confirmado, com a outra tag.
 * O dedupe é separado, então as duas podem contar o mesmo pedido.
 */
export function GoogleAdsConversion({
  orderId,
  value,
  currency = "BRL",
  paid = false,
}: {
  orderId: string;
  value: number;
  currency?: string;
  /** true = só a tag de pedido pago. false = tag de pedido gerado (Pix). */
  paid?: boolean;
}) {
  const { data: settings } = useStoreSettings();
  const sendTo = normalizeAdsSendTo(
    paid
      ? settings?.tracking?.googleAdsPaidConversionSendTo
      : settings?.tracking?.googleAdsConversionSendTo,
  );

  useEffect(() => {
    if (!sendTo || !orderId) return;
    fireGoogleAdsConversion({
      sendTo,
      value,
      transactionId: orderId,
      currency,
      scope: paid ? "paid" : "order",
    });
  }, [sendTo, orderId, value, currency, paid]);

  return null;
}
