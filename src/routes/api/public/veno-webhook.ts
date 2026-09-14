import { createFileRoute } from "@tanstack/react-router";
import { mapVenoStatus } from "@/lib/veno";

type VenoWebhookPayload = {
  event?: string;
  data?: {
    id?: string;
    txid?: string;
    external_id?: string;
    status?: string;
    amount?: number;
  };
};

export const Route = createFileRoute("/api/public/veno-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: VenoWebhookPayload;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const depositId = payload.data?.id ? String(payload.data.id) : null;
        const externalId = payload.data?.external_id ? String(payload.data.external_id) : null;
        const eventType = payload.event ?? payload.data?.status ?? "deposit.update";
        const mapped = mapVenoStatus(payload.data?.status ?? payload.event?.replace(/^deposit\./, ""));
        const eventId = `veno-${eventType}-${depositId ?? externalId ?? Date.now()}`;

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

        const update: { payment_status: string; status?: "confirmed" | "cancelled" | "refunded" } = {
          payment_status: mapped,
        };
        if (mapped === "confirmed") update.status = "confirmed";
        if (mapped === "cancelled") update.status = "cancelled";
        if (mapped === "refunded") update.status = "refunded";

        let orderId: string | null = null;
        let previousStatus: string | null = null;

        if (externalId && /^[0-9a-f-]{36}$/i.test(externalId)) {
          const { data: byExternal } = await supabaseAdmin
            .from("orders")
            .select("id, status")
            .eq("id", externalId)
            .maybeSingle();
          if (byExternal) {
            orderId = byExternal.id;
            previousStatus = byExternal.status;
          }
        }

        if (!orderId && depositId) {
          const { data: byTx } = await supabaseAdmin
            .from("orders")
            .select("id, status")
            .eq("pagou_transaction_id", depositId)
            .maybeSingle();
          if (byTx) {
            orderId = byTx.id;
            previousStatus = byTx.status;
          }
        }

        if (orderId) {
          await supabaseAdmin.from("orders").update(update).eq("id", orderId);
          if (mapped === "confirmed" && previousStatus === "pending") {
            try {
              const { onPaymentConfirmed } = await import("@/lib/track7-sync");
              await onPaymentConfirmed(orderId);
            } catch (e) {
              console.error("onPaymentConfirmed failed", e);
            }
          }
        }

        await supabaseAdmin.from("webhook_events").update({ processed: true }).eq("pagou_event_id", eventId);
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("veno webhook", { status: 200 }),
    },
  },
});
