import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildPixQrDataUrl,
} from "@/lib/pix-qrcode";
import { paymentDescription } from "@/lib/payment-description";
import {
  encodeVenoProviderNote,
  isVenoOrder,
  mapVenoStatus,
  venoCreatePix,
  venoPaymentStatus,
} from "@/lib/veno";
import { registerCouponUse, resolveCouponDiscount } from "@/lib/coupon.functions";
import { isValidCpfOrCnpj } from "@/lib/validation";

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
async function getCheckoutSessionUserId(supabaseAdmin: SupabaseAdmin): Promise<string | null> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
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
    console.warn("getCheckoutSessionUserId: sessão opcional falhou", e);
  }
  return null;
}

async function resolveCheckoutUserId(
  supabaseAdmin: SupabaseAdmin,
  customerEmail: string,
): Promise<string | null> {
  const sessionUserId = await getCheckoutSessionUserId(supabaseAdmin);
  if (sessionUserId) return sessionUserId;

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
    .select("id, order_number, user_id")
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
    document: z
      .string()
      .min(11)
      .refine((v) => isValidCpfOrCnpj(v), { message: "CPF ou CNPJ inválido" }),
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
    const subtotal = Math.round(data.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100;
    const coupon = await resolveCouponDiscount(supabaseAdmin, data.couponCode, subtotal);
    if (!coupon.ok) throw new Error(coupon.error);

    const { data: settingsRow } = await supabaseAdmin
      .from("store_settings")
      .select("data")
      .eq("id", "singleton")
      .maybeSingle();
    const pixPercent = Number((settingsRow?.data as { payments?: { pixDiscount?: number } } | null)?.payments?.pixDiscount ?? 0);
    const pixDiscount = Math.round(Math.max(0, subtotal - coupon.discount) * (pixPercent / 100) * 100) / 100;
    const discount = Math.round((coupon.discount + pixDiscount) * 100) / 100;
    const total = Math.round((Math.max(0, subtotal - discount) + data.shipping) * 100) / 100;
    if (total <= 0) throw new Error("O valor do pedido ficou inválido depois do cupom.");

    const cellphone = (data.customer.phone || "").replace(/\D/g, "");
    const taxId = data.customer.document.replace(/\D/g, "");
    // Validar ANTES de criar o pedido — evita lixo de "cancelados" por CPF inválido
    // (a Veno rejeita o Pix e o fluxo antigo marcava o order como cancelled).
    if (cellphone.length < 10) {
      throw new Error("Informe um celular válido com DDD para pagar com Pix.");
    }
    if (!isValidCpfOrCnpj(taxId)) {
      throw new Error("Informe um CPF ou CNPJ válido para pagar com Pix.");
    }

    const priced = {
      ...data,
      subtotal,
      discount,
      total,
      couponCode: coupon.code,
      payment_method: "pix" as const,
    };
    const order = await createOrderWithItems(supabaseAdmin, priced);

    const description = paymentDescription(order.id, priced.total);
    const amountCents = Math.round(priced.total * 100);

    const addr = data.shippingAddress ?? {};
    let pix: Awaited<ReturnType<typeof venoCreatePix>>;
    try {
      pix = await venoCreatePix({
        amountCents,
        description,
        externalId: order.id,
        callbackUrl: `${siteOrigin()}/api/public/veno-webhook`,
        payer: {
          name: data.customer.name,
          email: data.customer.email,
          document: taxId,
          phone: cellphone,
          address: [addr.street, addr.number].filter(Boolean).join(", ") || undefined,
          city: typeof addr.city === "string" ? addr.city : undefined,
          state: typeof addr.state === "string" ? addr.state : undefined,
          zipCode: String(addr.zip ?? addr.zipCode ?? "").replace(/\D/g, "") || undefined,
        },
      });
    } catch (e) {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "cancelled",
          status: "cancelled",
          notes: [data.notes, "Falha ao gerar Pix na Veno"].filter(Boolean).join(" | "),
        })
        .eq("id", order.id);
      throw e;
    }

    const qrCode = pix.pixCopyPaste;
    const qrImage = await buildPixQrDataUrl(qrCode, pix.qrImage);
    const expiration =
      pix.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { newPixReceiptToken } = await import("@/lib/pix-receipt.functions");
    const receiptToken = newPixReceiptToken();

    await supabaseAdmin
      .from("orders")
      .update({
        // UUID do depósito Veno — usado no GET /api/v1/pix/{id}/status e no webhook.
        pagou_transaction_id: pix.id,
        payment_status: "pending",
        pix_qr_code: qrCode,
        pix_expiration: expiration,
        pix_receipt_token: receiptToken,
        notes: encodeVenoProviderNote(data.notes),
      })
      .eq("id", order.id);

    if (coupon.couponId && coupon.discount > 0) {
      await registerCouponUse(supabaseAdmin, {
        couponId: coupon.couponId,
        orderId: order.id,
        userId: order.user_id,
        discount: coupon.discount,
      });
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      transactionId: pix.id,
      status: "pending" as const,
      qrCode,
      qrImage,
      expiresAt: expiration,
      receiptToken,
    };
  });

export const createCheckoutCard = createServerFn({ method: "POST" })
  .inputValidator((d) => CardInput.parse(d))
  .handler(async () => {
    throw new Error("Pagamento por cartão indisponível no momento. Use Pix.");
  });

export const getPayoutStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, pagou_transaction_id, payment_status, status, payment_method, notes")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order?.pagou_transaction_id) {
      return { status: order?.payment_status ?? "pending", orderStatus: order?.status ?? "pending" };
    }

    let mapped: "pending" | "confirmed" | "cancelled" | "refunded";

    if (order.payment_method === "pix" && isVenoOrder(order.notes)) {
      const venoStatus = await venoPaymentStatus(order.pagou_transaction_id);
      mapped = mapVenoStatus(venoStatus);
    } else {
      const tx = await payoutbrFetch(`/transactions/${order.pagou_transaction_id}`);
      mapped = mapStatus(tx?.status);
    }

    const update: { payment_status: string; status?: "confirmed" | "cancelled" | "refunded" } = {
      payment_status: mapped,
    };
    if (mapped === "confirmed" && order.status === "pending") update.status = "confirmed";
    if (mapped === "cancelled") update.status = "cancelled";
    if (mapped === "refunded") update.status = "refunded";

    await supabaseAdmin.from("orders").update(update).eq("id", data.orderId);

    if (mapped === "confirmed" && order.status === "pending") {
      try {
        const { onPaymentConfirmed } = await import("@/lib/track7-sync");
        await onPaymentConfirmed(data.orderId);
      } catch (e) {
        console.error("onPaymentConfirmed failed", e);
      }
    }

    return { status: mapped, orderStatus: (update.status as string) ?? order.status };
  });

/**
 * Cliente optou por fazer um novo pedido em vez de continuar pagando um Pix
 * pendente. Só anota o pedido antigo para o admin entender o histórico —
 * NUNCA cancela a cobrança no gateway nem muda o status: se o cliente ainda
 * assim pagar aquele Pix esquecido, o webhook confirma normalmente.
 */
export const abandonPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const marker = "cliente_optou_novo_pedido";

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, notes, status")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order || order.status !== "pending" || order.notes?.includes(marker)) {
      return { ok: true };
    }

    await supabaseAdmin
      .from("orders")
      .update({ notes: [order.notes, marker].filter(Boolean).join(" | ") })
      .eq("id", data.orderId);

    return { ok: true };
  });

const PAID_PAYMENT = new Set(["confirmed", "paid", "approved"]);
const CLOSED_ORDER = new Set([
  "confirmed",
  "shipped",
  "delivered",
  "separating",
  "invoiced",
  "out_for_delivery",
  "refunded",
]);

/**
 * Suporte reemite um Pix vencido: novo pedido com o mesmo cliente, produtos,
 * endereço e totais, e e-mail do Pix para o mesmo endereço do comprovante.
 * O pedido antigo não é cancelado — se aquele Pix ainda for pago, o webhook confirma.
 */
export const regenerateExpiredOrderPix = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const staffId = await getCheckoutSessionUserId(supabaseAdmin);
    if (!staffId) throw new Error("Faça login para gerar um novo Pix.");

    const [{ data: isAdmin }, { data: isSupport }] = await Promise.all([
      supabaseAdmin.rpc("has_role", { _user_id: staffId, _role: "admin" }),
      supabaseAdmin.rpc("has_role", { _user_id: staffId, _role: "support" }),
    ]);
    if (!isAdmin && !isSupport) throw new Error("Somente o suporte pode gerar um novo Pix.");

    const { data: source, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, customer_doc, shipping_address, subtotal, shipping, discount, coupon_code, total, notes, payment_status, status, pix_expiration, user_id",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !source) throw new Error("Pedido não encontrado.");

    const pay = (source.payment_status ?? "").toLowerCase();
    if (PAID_PAYMENT.has(pay) || CLOSED_ORDER.has(source.status)) {
      throw new Error("Este pedido já foi pago. Não dá para gerar outro Pix.");
    }

    const already = source.notes?.match(/pix_reemitido:#(\S+)/);
    if (already) {
      throw new Error(`Este pedido já foi reemitido como #${already[1].replace(/\|$/, "")}.`);
    }

    if (source.pix_expiration && new Date(source.pix_expiration).getTime() > Date.now()) {
      throw new Error("O Pix deste pedido ainda está válido.");
    }

    const taxId = (source.customer_doc ?? "").replace(/\D/g, "");
    const phone = (source.customer_phone ?? "").replace(/\D/g, "");
    if (!isValidCpfOrCnpj(taxId)) {
      throw new Error("O pedido não tem CPF ou CNPJ válido para gerar o Pix.");
    }
    if (phone.length < 10) {
      throw new Error("O pedido não tem celular com DDD para gerar o Pix.");
    }
    if (!source.customer_email?.includes("@")) {
      throw new Error("O pedido não tem e-mail do cliente.");
    }
    if (Number(source.total) <= 0) throw new Error("O valor do pedido é inválido.");

    const { data: itemRows, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("product_id, product_name, product_image, unit_price, quantity, total")
      .eq("order_id", source.id);
    if (itemsError) throw new Error(itemsError.message);
    if (!itemRows?.length) throw new Error("O pedido não tem produtos.");

    const productIds = itemRows
      .map((item) => item.product_id)
      .filter((id): id is string => !!id);
    let liveProducts = new Set<string>();
    if (productIds.length) {
      const { data: products } = await supabaseAdmin.from("products").select("id").in("id", productIds);
      liveProducts = new Set((products ?? []).map((product) => product.id));
    }

    const address =
      source.shipping_address &&
      typeof source.shipping_address === "object" &&
      !Array.isArray(source.shipping_address)
        ? (source.shipping_address as Record<string, unknown>)
        : {};
    const reissueNote = encodeVenoProviderNote(`reemissao do pedido #${source.order_number}`);

    const { data: order, error: insertError } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: source.customer_name,
        customer_email: source.customer_email.trim().toLowerCase(),
        customer_phone: source.customer_phone,
        customer_doc: taxId,
        shipping_address: source.shipping_address ?? {},
        subtotal: source.subtotal,
        shipping: source.shipping,
        discount: source.discount,
        coupon_code: source.coupon_code,
        total: source.total,
        notes: reissueNote,
        payment_method: "pix",
        payment_status: "pending",
        user_id: source.user_id,
      })
      .select("id, order_number")
      .single();
    if (insertError || !order) throw new Error(insertError?.message ?? "Não foi possível criar o pedido.");

    const { error: linesError } = await supabaseAdmin.from("order_items").insert(
      itemRows.map((item) => ({
        order_id: order.id,
        product_id: item.product_id && liveProducts.has(item.product_id) ? item.product_id : null,
        product_name: item.product_name,
        product_image: item.product_image,
        unit_price: item.unit_price,
        quantity: item.quantity,
        total: item.total,
      })),
    );
    if (linesError) {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "cancelled",
          status: "cancelled",
          notes: `${reissueNote} | Falha ao copiar os produtos`,
        })
        .eq("id", order.id);
      throw new Error(linesError.message);
    }

    let pix: Awaited<ReturnType<typeof venoCreatePix>>;
    try {
      pix = await venoCreatePix({
        amountCents: Math.round(Number(source.total) * 100),
        description: paymentDescription(order.id, Number(source.total)),
        externalId: order.id,
        callbackUrl: `${siteOrigin()}/api/public/veno-webhook`,
        payer: {
          name: source.customer_name,
          email: source.customer_email,
          document: taxId,
          phone,
          address: [address.street, address.number].filter(Boolean).join(", ") || undefined,
          city: typeof address.city === "string" ? address.city : undefined,
          state: typeof address.state === "string" ? address.state : undefined,
          zipCode: String(address.zip ?? address.zipCode ?? "").replace(/\D/g, "") || undefined,
        },
      });
    } catch (e) {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "cancelled",
          status: "cancelled",
          notes: `${reissueNote} | Falha ao gerar Pix na Veno`,
        })
        .eq("id", order.id);
      throw e;
    }

    const qrCode = pix.pixCopyPaste;
    const qrImage = await buildPixQrDataUrl(qrCode, pix.qrImage);
    const expiration = pix.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { newPixReceiptToken } = await import("@/lib/pix-receipt.functions");

    await supabaseAdmin
      .from("orders")
      .update({
        pagou_transaction_id: pix.id,
        payment_status: "pending",
        pix_qr_code: qrCode,
        pix_expiration: expiration,
        pix_receipt_token: newPixReceiptToken(),
        notes: reissueNote,
      })
      .eq("id", order.id);

    await supabaseAdmin
      .from("orders")
      .update({
        notes: [source.notes, `pix_reemitido:#${order.order_number}`].filter(Boolean).join(" | "),
      })
      .eq("id", source.id);

    const { sendReplacementPixEmail } = await import("@/lib/order-email");
    const email = await sendReplacementPixEmail(order.id, qrCode, expiration);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      qrCode,
      qrImage,
      expiresAt: expiration,
      email: source.customer_email.trim().toLowerCase(),
      emailSent: email.sent,
    };
  });
