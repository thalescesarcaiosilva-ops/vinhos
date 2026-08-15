import { createFileRoute } from "@tanstack/react-router";

function mapStatus(s?: string): "pending" | "confirmed" | "cancelled" | "refunded" {
  switch ((s ?? "").toLowerCase()) {
    case "paid":
    case "authorized":
      return "confirmed";
    case "refunded":
      return "refunded";
    case "refused":
    case "chargedback":
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function orderIdFromMetadata(metadata: unknown): string | null {
  if (metadata == null) return null;

  // Legado: metadata era só o UUID do pedido
  if (typeof metadata === "string") {
    const trimmed = metadata.trim();
    if (!trimmed) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { order_id?: unknown };
        if (typeof parsed?.order_id === "string" && parsed.order_id.trim()) {
          return parsed.order_id.trim();
        }
      } catch {
        /* metadata não era JSON */
      }
    }
    return null;
  }

  if (typeof metadata === "object") {
    const oid = (metadata as { order_id?: unknown }).order_id;
    if (typeof oid === "string" && oid.trim()) return oid.trim();
  }

  return null;
}

function extractOrderId(payload: any): string | null {
  const tx = payload?.data ?? payload?.transaction ?? payload;

  // Preferir referência externa estável (não muda com o metadata de compliance)
  const external =
    tx?.externalRef ??
    tx?.external_ref ??
    payload?.externalRef ??
    payload?.external_ref;
  if (typeof external === "string" && external.trim()) return external.trim();

  return orderIdFromMetadata(tx?.metadata) ?? orderIdFromMetadata(payload?.metadata);
}

export const Route = createFileRoute("/api/public/payoutbr-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const tx = payload?.data ?? payload?.transaction ?? payload;
        const eventId = String(tx?.id ?? payload?.id ?? `${tx?.status ?? "evt"}-${Date.now()}`);
        const eventType = payload?.type ?? tx?.status ?? "transaction.update";
        const orderId = extractOrderId(payload);
        const txStatus = tx?.status ?? payload?.status;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("id")
          .eq("pagou_event_id", eventId)
          .maybeSingle();
        if (existing) return new Response("ok", { status: 200 });

        await supabaseAdmin.from("webhook_events").insert({
          pagou_event_id: eventId,
          event_type: eventType,
          payload,
          processed: false,
        });

        const mapped = mapStatus(txStatus);
        const update: { payment_status: string; status?: "confirmed" | "cancelled" | "refunded" } = {
          payment_status: mapped,
        };
        if (mapped === "confirmed") update.status = "confirmed";
        if (mapped === "cancelled") update.status = "cancelled";
        if (mapped === "refunded") update.status = "refunded";

        if (orderId) {
          await supabaseAdmin.from("orders").update(update).eq("id", orderId);
        } else if (tx?.id != null) {
          await supabaseAdmin.from("orders").update(update).eq("pagou_transaction_id", String(tx.id));
        }

        if (mapped === "confirmed") {
          const paidOrderId =
            orderId ??
            (
              await supabaseAdmin
                .from("orders")
                .select("id")
                .eq("pagou_transaction_id", String(tx?.id ?? ""))
                .maybeSingle()
            ).data?.id;
          if (paidOrderId) {
            try {
              const { sendOrderPaidEmail } = await import("@/lib/order-email");
              await sendOrderPaidEmail(paidOrderId);
            } catch (e) {
              console.error("order confirmation email failed", e);
            }
          }
        }

        await supabaseAdmin.from("webhook_events").update({ processed: true }).eq("pagou_event_id", eventId);

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("payoutbr webhook", { status: 200 }),
    },
  },
});
