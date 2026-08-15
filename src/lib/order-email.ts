import { Resend } from "resend";
import { brl } from "@/lib/format";
import { STORE } from "@/lib/settings";
import { getSiteUrl } from "@/lib/site-url";

type OrderEmailItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type OrderEmailPayload = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  payment_method: string | null;
  shipping_address: Record<string, unknown> | null;
  order_items: OrderEmailItem[] | null;
};

function siteOrigin(): string {
  return getSiteUrl().replace(/\/+$/, "");
}

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn("[email] RESEND_API_KEY não configurada — e-mail de pedido não enviado.");
    return null;
  }
  return new Resend(key);
}

function fromAddress(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    `${STORE.name} <${STORE.email}>`
  );
}

function paymentLabel(method: string | null): string {
  if (method === "pix") return "Pix";
  if (method === "credit_card") return "Cartão de crédito";
  return method || "Pagamento online";
}

function formatAddress(addr: Record<string, unknown> | null): string {
  if (!addr) return "";
  const street = String(addr.street ?? "");
  const number = String(addr.number ?? "");
  const complement = addr.complement ? ` — ${addr.complement}` : "";
  const neighborhood = String(addr.neighborhood ?? "");
  const city = String(addr.city ?? "");
  const state = String(addr.state ?? "");
  const zip = String(addr.zip ?? addr.zipCode ?? "");
  return `${street}, ${number}${complement}<br/>${neighborhood}<br/>${city}/${state} · CEP ${zip}`;
}

function buildOrderEmailHtml(order: OrderEmailPayload): string {
  const items = order.order_items ?? [];
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#1a1a1a;">
          ${escapeHtml(i.product_name)}
          <div style="color:#777;font-size:12px;">Qtd: ${i.quantity}</div>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;white-space:nowrap;">
          ${brl(Number(i.total))}
        </td>
      </tr>`,
    )
    .join("");

  const accountUrl = `${siteOrigin()}/minha-conta`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f7f4f0;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4f0;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e0d8;">
        <tr>
          <td style="background:#5a1a1f;padding:28px 32px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:0.04em;">${escapeHtml(STORE.name.toUpperCase())}</div>
            <div style="margin-top:6px;font-size:13px;color:#e8c9a0;">Pagamento confirmado</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 12px;font-size:16px;color:#1a1a1a;">
              Olá, <strong>${escapeHtml(order.customer_name.split(" ")[0] || order.customer_name)}</strong>!
            </p>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#444;">
              Recebemos o pagamento do seu pedido <strong>#${escapeHtml(order.order_number)}</strong>.
              Já estamos preparando tudo com carinho.
            </p>

            <table role="presentation" width="100%" style="margin:0 0 20px;">
              ${rows}
            </table>

            <table role="presentation" width="100%" style="font-size:14px;color:#444;">
              <tr>
                <td style="padding:4px 0;">Subtotal</td>
                <td style="padding:4px 0;text-align:right;">${brl(Number(order.subtotal))}</td>
              </tr>
              ${
                Number(order.discount) > 0
                  ? `<tr><td style="padding:4px 0;">Desconto</td><td style="padding:4px 0;text-align:right;">−${brl(Number(order.discount))}</td></tr>`
                  : ""
              }
              <tr>
                <td style="padding:4px 0;">Frete</td>
                <td style="padding:4px 0;text-align:right;">${Number(order.shipping) === 0 ? "Grátis" : brl(Number(order.shipping))}</td>
              </tr>
              <tr>
                <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#5a1a1f;">Total</td>
                <td style="padding:12px 0 0;text-align:right;font-size:16px;font-weight:700;color:#5a1a1f;">${brl(Number(order.total))}</td>
              </tr>
            </table>

            <div style="margin-top:22px;padding-top:18px;border-top:1px solid #eee;font-size:13px;color:#555;line-height:1.55;">
              <div><strong>Pagamento:</strong> ${escapeHtml(paymentLabel(order.payment_method))}</div>
              <div style="margin-top:8px;"><strong>Entrega:</strong><br/>${formatAddress(order.shipping_address)}</div>
            </div>

            <div style="margin-top:28px;text-align:center;">
              <a href="${accountUrl}" style="display:inline-block;background:#5a1a1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
                Ver meus pedidos
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;background:#faf7f3;font-size:12px;color:#888;text-align:center;line-height:1.5;">
            Dúvidas? Fale conosco em
            <a href="mailto:${STORE.email}" style="color:#5a1a1f;">${STORE.email}</a><br/>
            © ${new Date().getFullYear()} ${STORE.name} · Aprecie com moderação
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Envia e-mail de pedido pago via Resend.
 * Idempotente: usa webhook_events com chave order-email-{orderId}.
 */
export async function sendOrderPaidEmail(orderId: string): Promise<{ sent: boolean; reason?: string }> {
  const resend = resendClient();
  if (!resend) return { sent: false, reason: "missing_api_key" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const eventKey = `order-email-${orderId}`;

  const { data: existing } = await supabaseAdmin
    .from("webhook_events")
    .select("id")
    .eq("pagou_event_id", eventKey)
    .maybeSingle();
  if (existing) return { sent: false, reason: "already_sent" };

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_email, total, subtotal, shipping, discount, payment_method, shipping_address, order_items(product_name, quantity, unit_price, total)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.customer_email) {
    console.error("[email] pedido não encontrado", orderId, error?.message);
    return { sent: false, reason: "order_not_found" };
  }

  const payload = order as unknown as OrderEmailPayload;
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      pagou_event_id: eventKey,
      event_type: "order.confirmation_email",
      payload: { orderId, email: payload.customer_email },
      processed: false,
    })
    .select("id")
    .maybeSingle();

  // corrida: outra request já reservou o envio
  if (insertError || !inserted) {
    return { sent: false, reason: "already_sent" };
  }

  try {
    const { error: sendError } = await resend.emails.send({
      from: fromAddress(),
      to: [payload.customer_email],
      subject: `Pedido #${payload.order_number} confirmado — ${STORE.name}`,
      html: buildOrderEmailHtml(payload),
    });

    if (sendError) {
      console.error("[email] Resend error", sendError);
      await supabaseAdmin
        .from("webhook_events")
        .update({ processed: false, error: String(sendError.message ?? sendError) })
        .eq("id", inserted.id);
      return { sent: false, reason: "resend_error" };
    }

    await supabaseAdmin.from("webhook_events").update({ processed: true }).eq("id", inserted.id);
    return { sent: true };
  } catch (e: any) {
    console.error("[email] falha ao enviar", e);
    await supabaseAdmin
      .from("webhook_events")
      .update({ processed: false, error: e?.message ?? "send_failed" })
      .eq("id", inserted.id);
    return { sent: false, reason: "exception" };
  }
}
