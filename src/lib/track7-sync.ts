/**
 * Sync idempotente Track7 após pagamento confirmado.
 * Falha da Track7 NUNCA deve derrubar o checkout/webhook.
 * Key só no servidor — nunca importar isto em páginas client diretamente
 * (use via createServerFn / handlers de webhook).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Track7TrackingData } from "@/lib/track7";

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

function track7ApiBase(): string {
  return (serverEnv("TRACK7_API_URL") || "https://track7.app/api/v1").replace(/\/+$/, "");
}

function track7ApiKey(): string | null {
  const key = serverEnv("TRACK7_API_KEY")?.trim() || "";
  return key || null;
}

function onlyDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Telefone Track7: 10–11 dígitos; remove 55 se vier 12–13. */
export function normalizeTrack7Phone(raw: string | null | undefined): string | null {
  let digits = onlyDigits(raw);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

/** CPF 11 ou CNPJ 14. */
export function normalizeTrack7Document(raw: string | null | undefined): string | null {
  const digits = onlyDigits(raw);
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}

/** transaction_id só [a-zA-Z0-9._-] */
export function normalizeTrack7TransactionId(preferred: string, fallbackUuid: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "");
  const fromPreferred = clean(preferred);
  if (fromPreferred.length >= 2) return fromPreferred.slice(0, 120);
  return clean(fallbackUuid).slice(0, 120) || fallbackUuid;
}

type SyncResult =
  | { ok: true; trackingCode: string; skipped?: boolean }
  | { ok: false; reason: string };

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string | null;
  tracking_code: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_doc: string | null;
  shipping_address: Record<string, unknown> | null;
  order_items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
  }> | null;
};

function isPaidOrder(order: Pick<OrderRow, "status" | "payment_status">): boolean {
  const pay = (order.payment_status ?? "").toLowerCase();
  const st = (order.status ?? "").toLowerCase();
  return (
    pay === "confirmed" ||
    pay === "paid" ||
    st === "confirmed" ||
    st === "paid"
  );
}

function buildAddress(addr: Record<string, unknown> | null) {
  const street = String(addr?.street ?? "").trim() || "Endereço não informado";
  const number = String(addr?.number ?? "").trim() || "S/N";
  const complement = addr?.complement != null ? String(addr.complement).trim() || null : null;
  const neighborhood = String(addr?.neighborhood ?? "").trim() || "Centro";
  const city = String(addr?.city ?? "").trim() || "Não informado";
  const stateRaw = String(addr?.state ?? "").trim().toUpperCase();
  const state = stateRaw.slice(0, 2) || "SP";
  const zipDigits = onlyDigits(String(addr?.zip ?? addr?.zipCode ?? ""));
  const zipcode = zipDigits.length === 8 ? zipDigits : undefined;

  return {
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    ...(zipcode ? { zipcode } : {}),
  };
}

function extractTrackingCode(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const code = String(
    data.tracking_code ?? data.trackingCode ?? data.code ?? root.tracking_code ?? "",
  ).trim();
  return code || null;
}

/**
 * Cria o pedido na Track7 (POST /orders) e grava tracking_code localmente.
 * Idempotente: se já tem tracking_code, não chama de novo.
 * Nunca lança — retorna { ok:false } e loga.
 */
export async function syncOrderToTrack7(orderId: string): Promise<SyncResult> {
  try {
    const apiKey = track7ApiKey();
    if (!apiKey) {
      console.warn("[track7] TRACK7_API_KEY ausente — sync ignorado");
      return { ok: false, reason: "missing_api_key" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, tracking_code, customer_name, customer_email, customer_phone, customer_doc, shipping_address, order_items(product_name, quantity, unit_price)",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      console.warn("[track7] pedido não encontrado", orderId, error?.message);
      return { ok: false, reason: "order_not_found" };
    }

    const row = order as unknown as OrderRow;

    if (row.tracking_code?.trim()) {
      return { ok: true, trackingCode: row.tracking_code.trim(), skipped: true };
    }

    if (!isPaidOrder(row)) {
      return { ok: false, reason: "not_paid" };
    }

    const email = (row.customer_email ?? "").trim().toLowerCase();
    const phone = normalizeTrack7Phone(row.customer_phone);
    const document = normalizeTrack7Document(row.customer_doc);
    if (!email || !phone || !document) {
      console.warn("[track7] dados do cliente incompletos", orderId, {
        email: !!email,
        phone: !!phone,
        document: !!document,
      });
      return { ok: false, reason: "invalid_customer" };
    }

    const items = (row.order_items ?? [])
      .map((i) => ({
        name: String(i.product_name ?? "Produto").slice(0, 200),
        quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
        price: Math.round(Number(i.unit_price) * 100) / 100,
      }))
      .filter((i) => i.price >= 0);

    if (items.length === 0) {
      console.warn("[track7] pedido sem itens", orderId);
      return { ok: false, reason: "no_items" };
    }

    const total = Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
    const transactionId = normalizeTrack7TransactionId(row.order_number, row.id);

    const body = {
      transaction_id: transactionId,
      currency: "BRL",
      total,
      customer: {
        name: (row.customer_name || "Cliente").trim(),
        email,
        phone,
        document,
      },
      address: buildAddress(row.shipping_address),
      products: items,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    let res: Response;
    try {
      res = await fetch(`${track7ApiBase()}/orders`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "network_error";
      console.error("[track7] POST /orders falhou", orderId, msg);
      return { ok: false, reason: "upstream" };
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[track7] POST /orders HTTP", res.status, orderId, text.slice(0, 300));
      return { ok: false, reason: `http_${res.status}` };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      console.error("[track7] resposta inválida", orderId);
      return { ok: false, reason: "invalid_response" };
    }

    const trackingCode = extractTrackingCode(json);
    if (!trackingCode) {
      console.error("[track7] resposta sem tracking_code", orderId, json);
      return { ok: false, reason: "no_tracking_code" };
    }

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ tracking_code: trackingCode })
      .eq("id", orderId)
      .is("tracking_code", null);

    if (updErr) {
      console.error("[track7] falha ao salvar tracking_code", orderId, updErr.message);
      // Código já existe na Track7 — ainda reportamos sucesso do sync remoto.
    }

    return { ok: true, trackingCode };
  } catch (e: unknown) {
    console.error("[track7] sync exception", orderId, e);
    return { ok: false, reason: "exception" };
  }
}

/**
 * Após pagamento confirmado: sync Track7 (await) + e-mail.
 * Track7 nunca propaga erro para o caller.
 */
export async function onPaymentConfirmed(orderId: string): Promise<void> {
  await syncOrderToTrack7(orderId);
  try {
    const { sendOrderPaidEmail } = await import("@/lib/order-email");
    await sendOrderPaidEmail(orderId);
  } catch (e) {
    console.error("[email] onPaymentConfirmed failed", e);
  }
}

/** ServerFn para o admin re-disparar sync (pedido pago sem código). */
export const syncTrack7OrderFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return syncOrderToTrack7(data.orderId);
  });

/** Reexport tipo útil para consumidores. */
export type { Track7TrackingData };
