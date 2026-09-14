import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { allowPayWebhookSecret, mapAllowPayStatus } from "@/lib/allowpay";

function verifyAllowPaySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/allowpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = allowPayWebhookSecret();
        if (secret) {
          const sig = request.headers.get("x-allowpay-signature");
          if (!verifyAllowPaySignature(raw, sig, secret)) {
            return new Response("invalid signature", { status: 401 });
          }
        }

        let payload: {
          event_id?: string;
          event?: string;
          txid?: string;
          status?: string;
          amount?: number;
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const eventId = String(payload.event_id ?? `allowpay-${payload.txid ?? "evt"}-${Date.now()}`);
        const eventType = payload.event ?? payload.status ?? "payment.update";
        const txid = payload.txid ? String(payload.txid) : null;
        const mapped = mapAllowPayStatus(payload.status);

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

        if (!txid) {
          await supabaseAdmin.from("webhook_events").update({ processed: true }).eq("pagou_event_id", eventId);
          return new Response("ok", { status: 200 });
        }

        const update: { payment_status: string; status?: "confirmed" | "cancelled" | "refunded" } = {
          payment_status: mapped,
        };
        if (mapped === "confirmed") update.status = "confirmed";
        if (mapped === "cancelled") update.status = "cancelled";
        if (mapped === "refunded") update.status = "refunded";

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, status")
          .eq("pagou_transaction_id", txid)
          .maybeSingle();

        if (order) {
          await supabaseAdmin.from("orders").update(update).eq("id", order.id);
          if (mapped === "confirmed" && order.status === "pending") {
            try {
              const { onPaymentConfirmed } = await import("@/lib/track7-sync");
              await onPaymentConfirmed(order.id);
            } catch (e) {
              console.error("onPaymentConfirmed failed", e);
            }
          }
        }

        await supabaseAdmin.from("webhook_events").update({ processed: true }).eq("pagou_event_id", eventId);
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("allowpay webhook", { status: 200 }),
    },
  },
});
