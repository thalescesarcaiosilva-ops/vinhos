import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  buildPixQrDataUrl,
  extractPixCopyPaste,
  extractPixExpiration,
  extractPixImageFromApi,
} from "@/lib/pix-qrcode";
import { installmentPlan, mergeInstallmentRates, type InstallmentPlanInput } from "@/lib/installments";

type SupabaseAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

function toBase64(value: string): string {
  // ASCII-safe (chaves PayoutBR); evita node:buffer no bundle do browser.
  return btoa(value);
}

/**
 * Resolve o user_id do checkout:
 * 1) sessão logada (Bearer anexado pelo attachSupabaseAuth)
 * 2) fallback: e-mail do pedido bate com um usuário cadastrado
 * 3) e-mail novo / sem conta → null (pedido fica só com customer_email;
 *    ao cadastrar/entrar depois, link_guest_orders_to_user vincula)
 */
async function resolveCheckoutUserId(
  supabaseAdmin: SupabaseAdmin,
  customerEmail: string,
): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (!error && data.user?.id) return data.user.id;
      }
    }
  } catch (e) {
    console.warn("resolveCheckoutUserId: sessão opcional falhou", e);
  }

  const email = customerEmail.trim().toLowerCase();
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin.rpc("lookup_user_id_by_email", {
      p_email: email,
    });
    if (error) {
      console.warn("lookup_user_id_by_email:", error.message);
      return null;
    }
    return typeof data === "string" && data ? data : null;
  } catch (e) {
    console.warn("resolveCheckoutUserId: lookup por e-mail falhou", e);
    return null;
  }
}

function payoutbrApiUrl(): string {
  return (serverEnv("PAYOUTBR_API_URL") || "https://api.payoutbr.com.br/v1").replace(/\/+$/, "");
}

function payoutbrSecretKey(): string {
  const secret = serverEnv("PAYOUTBR_SECRET_KEY")?.trim();
  if (!secret) {
    throw new Error(
      "PAYOUTBR_SECRET_KEY não configurada no servidor. Adicione na Vercel e faça redeploy.",
    );
  }
  if (secret.startsWith("pk_")) {
    throw new Error("PAYOUTBR_SECRET_KEY está com a chave pública (pk_). Use a chave secreta (sk_).");
  }
  if (!secret.startsWith("sk_live_") && !secret.startsWith("sk_test_")) {
    throw new Error("PAYOUTBR_SECRET_KEY inválida. Deve começar com sk_live_ ou sk_test_.");
  }
  return secret;
}

function payoutbrAuthHeader(): string {
  return `Basic ${toBase64(`${payoutbrSecretKey()}:x`)}`;
}

// Traduz mensagens técnicas da PayoutBR para pt-BR amigável.
function translatePayoutMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("cpf_cnpj") || (m.includes("cpf") && m.includes("válid"))) return "CPF/CNPJ inválido para o pagamento.";
  if (m.includes("card.number")) return "Número do cartão inválido.";
  if (m.includes("holdername")) return "Nome impresso no cartão inválido.";
  if (m.includes("expirationmonth")) return "Mês de validade do cartão inválido.";
  if (m.includes("expirationyear")) return "Ano de validade do cartão inválido.";
  if (m.includes("cvv") || m.includes("cvc")) return "Código de segurança (CVV) inválido.";
  if (m.includes("insufficient")) return "Cartão sem saldo/limite disponível.";
  if (m.includes("expired")) return "Cartão expirado.";
  return message;
}

// Extrai um texto de erro legível de estruturas variadas da PayoutBR,
// incluindo o caso em que "message" é uma string JSON aninhada
// (ex.: {"message":"{\"errors\":{\"payer.cpf_cnpj\":[\"não é válido\"]}}"}).
function formatPayoutError(json: { message?: unknown; error?: unknown } | null, fallback: string): string {
  const raw = json?.message ?? json?.error;

  if (Array.isArray(raw)) {
    const parts = raw.filter((x): x is string => typeof x === "string").map(translatePayoutMessage);
    return [...new Set(parts)].join(" ") || fallback;
  }

  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith('"')) {
      try {
        const nested = JSON.parse(trimmed);
        const parsed = typeof nested === "string" ? JSON.parse(nested) : nested;
        const errors = parsed?.errors;
        if (errors && typeof errors === "object") {
          const messages = Object.entries(errors).flatMap(([field, val]) => {
            const list = Array.isArray(val) ? val : [val];
            return list.map((v) => translatePayoutMessage(`${field} ${String(v)}`));
          });
          if (messages.length) return [...new Set(messages)].join(" ");
        }
        if (typeof parsed === "string") return translatePayoutMessage(parsed);
      } catch {
        /* não era JSON aninhado, usa a string original */
      }
    }
    return translatePayoutMessage(trimmed);
  }

  return fallback;
}

async function payoutbrFetch(path: string, init?: RequestInit) {
  const url = `${payoutbrApiUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      authorization: payoutbrAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* noop */
  }
  if (!res.ok) {
    console.error("PayoutBR error", res.status, url, text);
    if (res.status === 401) {
      throw new Error("Chave da API PayoutBR inválida. Verifique PAYOUTBR_SECRET_KEY na Vercel e faça redeploy.");
    }
    throw new Error(formatPayoutError(json, json?.errors?.[0]?.message ?? `PayoutBR ${res.status}`));
  }
  return json?.data ?? json;
}

// A PayoutBR devolve refusedReason ora como string, ora como objeto
// { acquirerCode, description, antifraud }. Extrai um texto legível.
function extractRefusedReason(reason: unknown): string | null {
  if (!reason) return null;
  if (typeof reason === "string") return reason.trim() || null;
  if (typeof reason === "object") {
    const desc = (reason as { description?: unknown }).description;
    if (typeof desc === "string" && desc.trim()) return desc.trim();
  }
  return null;
}

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

function siteOrigin(): string {
  return (serverEnv("PUBLIC_SITE_URL") || serverEnv("VITE_PUBLIC_SITE_URL") || "https://www.galvaovinhos.com.br").replace(
    /\/+$/,
    "",
  );
}

/** IP do comprador (x-forwarded-for / x-real-ip). Omite se inválido. */
function getClientIp(): string | undefined {
  try {
    const request = getRequest();
    if (!request?.headers) return undefined;
    const candidates: string[] = [];
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      for (const part of forwarded.split(",")) {
        const ip = part.trim();
        if (ip) candidates.push(ip);
      }
    }
    for (const header of ["x-real-ip", "cf-connecting-ip", "true-client-ip"]) {
      const v = request.headers.get(header)?.trim();
      if (v) candidates.push(v);
    }
    for (const raw of candidates) {
      const ip = normalizeClientIp(raw);
      if (ip) return ip;
    }
  } catch {
    /* request indisponível */
  }
  return undefined;
}

function normalizeClientIp(raw: string): string | undefined {
  let ip = raw.trim();
  if (!ip) return undefined;
  // IPv4 com porta (ex.: 1.2.3.4:1234)
  const v4Port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4Port) ip = v4Port[1];
  // [IPv6]:port
  const v6Brackets = ip.match(/^\[([0-9a-f:]+)\](?::\d+)?$/i);
  if (v6Brackets) ip = v6Brackets[1];

  const lower = ip.toLowerCase();
  if (
    lower === "unknown" ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "localhost" ||
    lower === "::1" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0"
  ) {
    return undefined;
  }

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const ok = ip.split(".").every((octet) => {
      const n = Number(octet);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
    return ok ? ip : undefined;
  }

  // IPv6 básico
  if (ip.includes(":") && /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45) {
    return ip;
  }
  return undefined;
}

/** Metadata de compliance + IP (campo próprio) + externalRef estável. */
function buildTransactionCompliance(orderId: string, userEmail: string): {
  metadata: string;
  externalRef: string;
  ip?: string;
} {
  const shopUrl = siteOrigin();
  const metadata = JSON.stringify({
    provider: "CustomCheckout",
    user_email: userEmail,
    order_id: orderId,
    checkout_url: `${shopUrl}/checkout`,
    shop_url: shopUrl,
  });
  const ip = getClientIp();
  return {
    metadata,
    externalRef: orderId,
    ...(ip ? { ip } : {}),
  };
}

function buildAddress(addr: Record<string, any>) {
  return {
    street: addr.street ?? "",
    streetNumber: String(addr.number ?? ""),
    complement: addr.complement || undefined,
    neighborhood: addr.neighborhood ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zipCode: String(addr.zip ?? addr.zipCode ?? "").replace(/\D/g, ""),
    country: "BR",
  };
}

function buildCustomer(customer: { name: string; email: string; phone?: string | null; document: string }, addr: Record<string, any>) {
  const phone = (customer.phone || "").replace(/\D/g, "");
  return {
    name: customer.name,
    email: customer.email,
    phone: phone || undefined,
    document: {
      type: "cpf",
      number: customer.document.replace(/\D/g, ""),
    },
    address: buildAddress(addr),
  };
}

function buildItems(items: Array<{ name: string; price: number; quantity: number; productId?: string | null }>) {
  return items.map((item) => ({
    title: item.name.slice(0, 120),
    unitPrice: Math.round(item.price * 100),
    quantity: item.quantity,
    tangible: true,
    externalRef: item.productId ?? undefined,
  }));
}

/**
 * Monta itens para a PayoutBR com soma (unitPrice * qty) === targetItemsCents.
 * Necessário quando há desconto Pix/cupom: o `amount` cobrado é menor que o
 * subtotal cheio; a gateway rejeita se amount ≠ itens + frete.
 */
function buildItemsMatchingAmount(
  items: Array<{ name: string; price: number; quantity: number; productId?: string | null }>,
  targetItemsCents: number,
) {
  const target = Math.max(0, Math.round(targetItemsCents));

  if (!items.length) {
    return [
      {
        title: "Pedido",
        unitPrice: target,
        quantity: 1,
        tangible: true as const,
      },
    ];
  }

  const weights = items.map((i) => Math.max(0, Math.round(i.price * 100) * Math.max(1, i.quantity)));
  const gross = weights.reduce((a, b) => a + b, 0);

  if (gross <= 0) {
    return items.map((item, idx) => ({
      title: item.name.slice(0, 120),
      unitPrice: idx === 0 ? target : 0,
      quantity: idx === 0 ? 1 : Math.max(1, item.quantity),
      tangible: true as const,
      externalRef: item.productId ?? undefined,
    }));
  }

  let remaining = target;
  return items.map((item, idx) => {
    const isLast = idx === items.length - 1;
    let lineTotal = isLast ? remaining : Math.floor((weights[idx] / gross) * target);
    if (!isLast) remaining -= lineTotal;
    lineTotal = Math.max(0, lineTotal);

    const qty = Math.max(1, item.quantity);
    if (lineTotal % qty === 0) {
      return {
        title: item.name.slice(0, 120),
        unitPrice: lineTotal / qty,
        quantity: qty,
        tangible: true as const,
        externalRef: item.productId ?? undefined,
      };
    }
    // Soma exata: 1 unidade com o valor rateado da linha
    return {
      title: item.name.slice(0, 120),
      unitPrice: lineTotal,
      quantity: 1,
      tangible: true as const,
      externalRef: item.productId ?? undefined,
    };
  });
}

function payoutLineItems(
  items: Array<{ name: string; price: number; quantity: number; productId?: string | null }>,
  total: number,
  shipping: number,
) {
  const amountCents = Math.round(total * 100);
  const shippingCents = Math.round(shipping * 100);
  const targetItemsCents = Math.max(0, amountCents - shippingCents);
  const grossItemsCents = items.reduce(
    (s, i) => s + Math.round(i.price * 100) * Math.max(1, i.quantity),
    0,
  );
  // Sem desconto (ou diferença só de arredondamento irrelevante): mantém preços cheios
  if (Math.abs(grossItemsCents - targetItemsCents) <= 1) {
    return { amountCents, shippingCents, items: buildItems(items) };
  }
  return {
    amountCents,
    shippingCents,
    items: buildItemsMatchingAmount(items, targetItemsCents),
  };
}

async function createOrderWithItems(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  data: {
    customer: { name: string; email: string; phone?: string | null; document: string };
    shippingAddress: Record<string, any>;
    items: Array<{ productId?: string | null; name: string; image?: string | null; price: number; quantity: number }>;
    subtotal: number;
    shipping: number;
    discount: number;
    total: number;
    couponCode?: string | null;
    notes?: string | null;
    payment_method: "pix" | "credit_card";
  },
) {
  const email = data.customer.email.trim().toLowerCase();
  const userId = await resolveCheckoutUserId(supabaseAdmin, email);

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name: data.customer.name,
      customer_email: email,
      customer_phone: data.customer.phone ?? null,
      customer_doc: data.customer.document,
      shipping_address: data.shippingAddress,
      subtotal: data.subtotal,
      shipping: data.shipping,
      discount: data.discount,
      coupon_code: data.couponCode ?? null,
      total: data.total,
      notes: data.notes ?? null,
      payment_method: data.payment_method,
      payment_status: "pending",
      user_id: userId,
    })
    .select("id, order_number")
    .single();
  if (error) throw new Error(error.message);

  const lines = data.items.map((item) => ({
    order_id: order.id,
    product_id: item.productId ?? null,
    product_name: item.name,
    product_image: item.image ?? null,
    unit_price: item.price,
    quantity: item.quantity,
    total: item.price * item.quantity,
  }));
  const { error: itemsError } = await supabaseAdmin.from("order_items").insert(lines);
  if (itemsError) throw new Error(itemsError.message);

  return order;
}

const CheckoutInput = z.object({
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().nullable(),
    document: z.string().min(11),
  }),
  shippingAddress: z.record(z.string(), z.any()),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().optional().nullable(),
        name: z.string(),
        image: z.string().optional().nullable(),
        price: z.number(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  subtotal: z.number(),
  shipping: z.number(),
  discount: z.number(),
  total: z.number().positive(),
  couponCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const CardInput = CheckoutInput.extend({
  token: z.string().min(1),
  installments: z.number().int().min(1).max(12).default(1),
});

async function loadPaymentSettings(supabaseAdmin: SupabaseAdmin): Promise<InstallmentPlanInput> {
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("data")
    .eq("id", "singleton")
    .maybeSingle();
  const raw = (data as { data?: { payments?: Record<string, unknown> } } | null)?.data?.payments ?? {};
  return {
    maxInstallments: Number(raw.maxInstallments) || 6,
    minInstallment: Number(raw.minInstallment) || 0,
    interestFreeUpTo: Number(raw.interestFreeUpTo) || 1,
    installmentRates: mergeInstallmentRates(raw.installmentRates as Record<string, number> | undefined),
  };
}

export const getPayoutPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const publicKey = serverEnv("PAYOUTBR_PUBLIC_KEY")?.trim() ?? "";
  if (!publicKey) {
    throw new Error("PAYOUTBR_PUBLIC_KEY não configurada no servidor. Adicione na Vercel e faça redeploy.");
  }
  if (publicKey.startsWith("sk_")) {
    throw new Error("PAYOUTBR_PUBLIC_KEY está com a chave secreta (sk_). Use a chave pública (pk_).");
  }
  return { publicKey, apiUrl: payoutbrApiUrl() };
});

export const createCheckoutPix = createServerFn({ method: "POST" })
  .inputValidator((d) => CheckoutInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const order = await createOrderWithItems(supabaseAdmin, { ...data, payment_method: "pix" });

    const { amountCents, shippingCents, items: payoutItems } = payoutLineItems(
      data.items,
      data.total,
      data.shipping,
    );
    const compliance = buildTransactionCompliance(order.id, data.customer.email);

    let tx: any;
    try {
      tx = await payoutbrFetch("/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: amountCents,
          paymentMethod: "pix",
          customer: buildCustomer(data.customer, data.shippingAddress),
          shipping: {
            fee: shippingCents,
            address: buildAddress(data.shippingAddress),
          },
          items: payoutItems,
          postbackUrl: `${siteOrigin()}/api/public/payoutbr-webhook`,
          ...compliance,
          traceable: true,
          pix: { expiresInDays: 1 },
        }),
      });
    } catch (e) {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "cancelled",
          status: "cancelled",
          notes: [data.notes, "Falha ao gerar Pix na PayoutBR"].filter(Boolean).join(" | "),
        })
        .eq("id", order.id);
      throw e;
    }

    const pixPayload = (tx?.pix ?? {}) as Record<string, unknown>;
    const qrCode = extractPixCopyPaste(pixPayload);
    const qrImage = await buildPixQrDataUrl(qrCode, extractPixImageFromApi(pixPayload));
    const expiration = extractPixExpiration(pixPayload);
    const txId = tx?.id != null ? String(tx.id) : null;
    const mapped = mapStatus(tx?.status);
    const { newPixReceiptToken } = await import("@/lib/pix-receipt.functions");
    const receiptToken = newPixReceiptToken();

    if (!qrCode) {
      await supabaseAdmin
        .from("orders")
        .update({
          pagou_transaction_id: txId,
          payment_status: mapped === "confirmed" ? mapped : "cancelled",
          status: mapped === "confirmed" ? "confirmed" : "cancelled",
          notes: [data.notes, "Pix criado sem QR/código copia-e-cola"].filter(Boolean).join(" | "),
        })
        .eq("id", order.id);
      throw new Error("Não foi possível gerar o QR Code Pix. Tente novamente em alguns minutos.");
    }

    await supabaseAdmin
      .from("orders")
      .update({
        pagou_transaction_id: txId,
        payment_status: mapped,
        pix_qr_code: qrCode,
        pix_expiration: expiration,
        pix_receipt_token: receiptToken,
      })
      .eq("id", order.id);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      transactionId: txId,
      status: mapped,
      qrCode,
      qrImage,
      expiresAt: expiration,
      receiptToken,
    };
  });

export const createCheckoutCard = createServerFn({ method: "POST" })
  .inputValidator((d) => CardInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payments = await loadPaymentSettings(supabaseAdmin);
    const cardBase = Math.max(0, data.subtotal - data.discount) + data.shipping;
    const plan = installmentPlan(cardBase, payments);
    const chosen = plan.find((p) => p.n === data.installments);
    if (!chosen) {
      throw new Error("Número de parcelas inválido para este pedido.");
    }
    // Valor enviado à PayoutBR = total do pedido (itens + frete − desconto), SEM somar
    // de novo as taxas de 2x–6x. Essas taxas já estão no painel da operadora e entram
    // uma vez no cartão via `installments`. Somar aqui cobraria o cliente em dobro.
    const charged = {
      ...data,
      total: cardBase,
      notes: [
        data.notes,
        `Cartão em ${chosen.n}x${chosen.hasInterest ? " com juros (taxa da operadora, sem acréscimo extra da loja)" : " sem juros"}`,
      ]
        .filter(Boolean)
        .join(" | "),
    };
    const order = await createOrderWithItems(supabaseAdmin, { ...charged, payment_method: "credit_card" });

    const { amountCents, shippingCents, items: payoutItems } = payoutLineItems(
      charged.items,
      cardBase,
      charged.shipping,
    );
    const compliance = buildTransactionCompliance(order.id, data.customer.email);

    let tx: any;
    try {
      tx = await payoutbrFetch("/transactions", {
        method: "POST",
        body: JSON.stringify({
          amount: amountCents,
          paymentMethod: "credit_card",
          installments: data.installments,
          card: { hash: data.token },
          customer: buildCustomer(data.customer, data.shippingAddress),
          shipping: {
            fee: shippingCents,
            address: buildAddress(data.shippingAddress),
          },
          items: payoutItems,
          postbackUrl: `${siteOrigin()}/api/public/payoutbr-webhook`,
          ...compliance,
          traceable: true,
        }),
      });
    } catch (e) {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "cancelled",
          status: "cancelled",
          notes: [data.notes, "Falha ao processar cartão na PayoutBR"].filter(Boolean).join(" | "),
        })
        .eq("id", order.id);
      throw e;
    }

    const txId = tx?.id != null ? String(tx.id) : null;
    const mapped = mapStatus(tx?.status);
    const refusedReason = extractRefusedReason(tx?.refusedReason);
    const update: {
      pagou_transaction_id: string | null;
      payment_status: string;
      status?: "confirmed" | "cancelled";
    } = {
      pagou_transaction_id: txId,
      payment_status: mapped,
    };
    if (mapped === "confirmed") update.status = "confirmed";
    if (mapped === "cancelled") update.status = "cancelled";

    await supabaseAdmin.from("orders").update(update).eq("id", order.id);

    if (mapped === "confirmed") {
      try {
        const { sendOrderPaidEmail } = await import("@/lib/order-email");
        await sendOrderPaidEmail(order.id);
      } catch (e) {
        console.error("order confirmation email failed", e);
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      transactionId: txId,
      status: mapped,
      rawStatus: tx?.status ?? null,
      refusedReason,
    };
  });

export const getPayoutStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, pagou_transaction_id, payment_status, status")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order?.pagou_transaction_id) {
      return { status: order?.payment_status ?? "pending", orderStatus: order?.status ?? "pending" };
    }

    const tx = await payoutbrFetch(`/transactions/${order.pagou_transaction_id}`);
    const mapped = mapStatus(tx?.status);

    const update: { payment_status: string; status?: "confirmed" | "cancelled" | "refunded" } = {
      payment_status: mapped,
    };
    if (mapped === "confirmed" && order.status === "pending") update.status = "confirmed";
    if (mapped === "cancelled") update.status = "cancelled";
    if (mapped === "refunded") update.status = "refunded";

    await supabaseAdmin.from("orders").update(update).eq("id", data.orderId);

    if (mapped === "confirmed" && order.status === "pending") {
      try {
        const { sendOrderPaidEmail } = await import("@/lib/order-email");
        await sendOrderPaidEmail(data.orderId);
      } catch (e) {
        console.error("order confirmation email failed", e);
      }
    }

    return { status: mapped, orderStatus: (update.status as string) ?? order.status };
  });
