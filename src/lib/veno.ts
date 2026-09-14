/**
 * Cliente Veno Payments (PIX). Somente servidor — nunca importar em páginas da loja.
 * Docs: https://beta.venopayments.com/docs
 */

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

export function venoApiUrl(): string {
  return (serverEnv("VENO_API_URL") || "https://beta.venopayments.com").replace(/\/+$/, "");
}

export function venoApiKey(): string {
  const key = serverEnv("VENO_API_KEY")?.trim();
  if (!key) {
    throw new Error("VENO_API_KEY não configurada no servidor. Adicione na Vercel (veno_live_...) e faça redeploy.");
  }
  if (!key.startsWith("veno_live_")) {
    throw new Error("VENO_API_KEY inválida. Deve começar com veno_live_.");
  }
  return key;
}

/** Marcador em orders.notes para identificar cobranças Veno no polling. */
export const VENO_PROVIDER_MARKER = "payment_provider=veno";

export function encodeVenoProviderNote(existing: string | null | undefined): string {
  const cleaned = (existing ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("payment_provider=") && !p.startsWith("allowpay_route="))
    .join(" | ");
  return cleaned ? `${cleaned} | ${VENO_PROVIDER_MARKER}` : VENO_PROVIDER_MARKER;
}

export function isVenoOrder(notes: string | null | undefined): boolean {
  return !!notes?.includes(VENO_PROVIDER_MARKER);
}

export type VenoCreatePixInput = {
  amountCents: number;
  description: string;
  externalId: string;
  callbackUrl: string;
  payer: {
    name: string;
    email: string;
    document: string;
    phone: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
};

export type VenoCreatePixResult = {
  id: string;
  txid: string | null;
  status: string;
  amount: number;
  pixCopyPaste: string;
  qrImage: string | null;
  expiresAt: string | null;
};

export type VenoStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "refunded"
  | "chargeback"
  | string;

async function venoErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: string; message?: string; detail?: string };
    return json.error || json.message || json.detail || text || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

function pickPixPayload(json: Record<string, unknown>): string {
  for (const key of ["pix_copy_paste", "qr_code_image", "qr_code", "emv", "payload"] as const) {
    const v = json[key];
    if (typeof v === "string" && v.startsWith("000201")) return v;
  }
  for (const key of ["pix_copy_paste", "qr_code_image", "qr_code"] as const) {
    const v = json[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Cria cobrança PIX. `products` usa o nome padronizado (nunca o vinho real)
 * com price=amount e quantity=1 — exigência Getnet/Stone da Veno.
 */
export async function venoCreatePix(input: VenoCreatePixInput): Promise<VenoCreatePixResult> {
  const amount = Math.round(input.amountCents);
  const body = {
    amount,
    description: input.description,
    external_id: input.externalId,
    callback_url: input.callbackUrl,
    payer: {
      name: input.payer.name,
      email: input.payer.email,
      document: input.payer.document.replace(/\D/g, ""),
      phone: input.payer.phone.replace(/\D/g, ""),
      ...(input.payer.address ? { address: input.payer.address } : {}),
      ...(input.payer.city ? { city: input.payer.city } : {}),
      ...(input.payer.state ? { state: input.payer.state.slice(0, 2).toUpperCase() } : {}),
      ...(input.payer.zipCode
        ? { zip_code: input.payer.zipCode.replace(/\D/g, "").slice(0, 8) }
        : {}),
    },
    products: [
      {
        external_ref: "item-1",
        name: input.description,
        price: amount,
        quantity: 1,
      },
    ],
  };

  const res = await fetch(`${venoApiUrl()}/api/v1/pix`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${venoApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Veno create-pix: ${await venoErrorMessage(res)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const id = typeof json.id === "string" ? json.id : "";
  const pixCopyPaste = pickPixPayload(json);
  if (!id || !pixCopyPaste) {
    throw new Error("Veno create-pix: resposta sem id/pix_copy_paste.");
  }

  const qrImageRaw = json.qr_code_image;
  const qrImage =
    typeof qrImageRaw === "string" &&
    (qrImageRaw.startsWith("http") || qrImageRaw.startsWith("data:"))
      ? qrImageRaw
      : null;

  return {
    id,
    txid: typeof json.txid === "string" ? json.txid : null,
    status: typeof json.status === "string" ? json.status : "pending",
    amount: typeof json.amount === "number" ? json.amount : amount,
    pixCopyPaste,
    qrImage,
    expiresAt: typeof json.expires_at === "string" ? json.expires_at : null,
  };
}

export async function venoPaymentStatus(depositId: string): Promise<VenoStatus> {
  const res = await fetch(`${venoApiUrl()}/api/v1/pix/${encodeURIComponent(depositId)}/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${venoApiKey()}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Veno payment-status: ${await venoErrorMessage(res)}`);
  }
  const json = (await res.json()) as { status?: string };
  return (json.status ?? "pending") as VenoStatus;
}

/** Mapeia status Veno → status interno da loja. */
export function mapVenoStatus(
  status: string | undefined,
): "pending" | "confirmed" | "cancelled" | "refunded" {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
    case "captured":
      return "confirmed";
    case "refunded":
    case "chargeback":
      return "refunded";
    case "expired":
    case "cancelled":
    case "canceled":
    case "denied":
      return "cancelled";
    case "pending":
    case "authorized":
    case "disputed":
    default:
      return "pending";
  }
}
