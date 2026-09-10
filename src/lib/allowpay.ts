/**
 * Cliente AllowPay (PIX). Somente servidor — nunca importar em páginas da loja.
 * Docs: POST /api/v2/allowpay-seller/create-pix (sem campo "route" no create).
 */

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

export function allowPayApiUrl(): string {
  return (serverEnv("ALLOWPAY_API_URL") || "https://allow-gi0i.onrender.com").replace(/\/+$/, "");
}

export function allowPayApiKey(): string {
  const key = serverEnv("ALLOWPAY_API_KEY")?.trim();
  if (!key) {
    throw new Error("ALLOWPAY_API_KEY não configurada no servidor.");
  }
  return key;
}

export function allowPayWebhookSecret(): string | undefined {
  return serverEnv("ALLOWPAY_WEBHOOK_SECRET")?.trim() || undefined;
}

/** Marcador em orders.notes para guardar a adquirente (necessário no payment-status). */
export const ALLOWPAY_ROUTE_MARKER = "allowpay_route=";

export function encodeAllowPayRouteNote(existing: string | null | undefined, route: string): string {
  const cleaned = (existing ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(ALLOWPAY_ROUTE_MARKER))
    .join(" | ");
  const marker = `${ALLOWPAY_ROUTE_MARKER}${route}`;
  return cleaned ? `${cleaned} | ${marker}` : marker;
}

export function parseAllowPayRoute(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(new RegExp(`${ALLOWPAY_ROUTE_MARKER}([a-zA-Z0-9_-]+)`));
  return m?.[1] ?? null;
}

export type AllowPayCreatePixInput = {
  amountCents: number;
  description: string;
  customer: {
    name: string;
    email: string;
    cellphone: string;
    taxId: string;
  };
  webhookUrl?: string;
  webhookSecret?: string;
};

export type AllowPayCreatePixResult = {
  route: string;
  txid: string;
  pixCode: string;
  pixQrCode: string | null;
};

export type AllowPayStatus =
  | "waiting_payment"
  | "approved"
  | "expired"
  | "declined"
  | "canceled"
  | "refunded"
  | "chargeback"
  | string;

async function allowPayErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.error || json.message || text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function allowPayCreatePix(input: AllowPayCreatePixInput): Promise<AllowPayCreatePixResult> {
  const apiKey = allowPayApiKey();
  const body: Record<string, unknown> = {
    api_key: apiKey,
    amount: Math.round(input.amountCents),
    description: input.description,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      cellphone: input.customer.cellphone.replace(/\D/g, ""),
      taxId: input.customer.taxId.replace(/\D/g, ""),
    },
  };
  // NUNCA enviar "route" no create — a AllowPay escolhe com fallback automático.
  if (input.webhookUrl) body.webhook_url = input.webhookUrl;
  if (input.webhookSecret) body.webhook_secret = input.webhookSecret;

  const res = await fetch(`${allowPayApiUrl()}/api/v2/allowpay-seller/create-pix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`AllowPay create-pix: ${await allowPayErrorMessage(res)}`);
  }

  const json = (await res.json()) as {
    route?: string;
    txid?: string;
    pix_code?: string;
    pix_qr_code?: string;
  };

  if (!json.txid || !json.pix_code) {
    throw new Error("AllowPay create-pix: resposta sem txid/pix_code.");
  }
  if (!json.route) {
    throw new Error("AllowPay create-pix: resposta sem route (necessária para consultar status).");
  }

  return {
    route: json.route,
    txid: json.txid,
    pixCode: json.pix_code,
    pixQrCode: typeof json.pix_qr_code === "string" ? json.pix_qr_code : null,
  };
}

export async function allowPayPaymentStatus(txid: string, route: string): Promise<AllowPayStatus> {
  const apiKey = allowPayApiKey();
  const url = `${allowPayApiUrl()}/api/v2/allowpay-seller/payment-status/${encodeURIComponent(txid)}?route=${encodeURIComponent(route)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    throw new Error(`AllowPay payment-status: ${await allowPayErrorMessage(res)}`);
  }
  const json = (await res.json()) as { status?: string };
  return (json.status ?? "waiting_payment") as AllowPayStatus;
}

/** Mapeia status AllowPay → status interno da loja. */
export function mapAllowPayStatus(
  status: string | undefined,
): "pending" | "confirmed" | "cancelled" | "refunded" {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "confirmed";
    case "refunded":
    case "chargeback":
      return "refunded";
    case "expired":
    case "declined":
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "waiting_payment":
    default:
      return "pending";
  }
}
