import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "pix-receipts";

function newId(): string {
  return crypto.randomUUID();
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type SupabaseAdmin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  user_id: string | null;
  customer_email: string;
  pix_receipt_path: string | null;
  pix_receipt_token: string | null;
};

function isPendingPayment(order: OrderRow): boolean {
  const pay = (order.payment_status ?? "pending").toLowerCase();
  return order.status === "pending" && pay !== "confirmed" && pay !== "paid";
}

function canAcceptReceipt(order: OrderRow): string | null {
  if (order.payment_method !== "pix") return "Comprovante só é aceito em pedidos Pix.";
  if (!isPendingPayment(order)) return "Este pedido já não está pendente de pagamento.";
  if (order.pix_receipt_path) return "Já existe um comprovante neste pedido.";
  return null;
}

async function getBearerUserId(supabaseAdmin: SupabaseAdmin): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

async function assertAdmin(supabaseAdmin: SupabaseAdmin): Promise<string> {
  const userId = await getBearerUserId(supabaseAdmin);
  if (!userId) throw new Error("Faça login como administrador.");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Acesso restrito a administradores.");
  return userId;
}

async function assertUploadAccess(
  supabaseAdmin: SupabaseAdmin,
  order: OrderRow,
  token?: string | null,
): Promise<void> {
  if (token && order.pix_receipt_token && token === order.pix_receipt_token) return;

  const userId = await getBearerUserId(supabaseAdmin);
  if (userId && order.user_id && userId === order.user_id) return;

  if (userId) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData.user?.email?.toLowerCase();
    if (email && email === order.customer_email.toLowerCase()) return;
  }

  throw new Error("Você não tem permissão para enviar comprovante neste pedido.");
}

/** Confirma pagamento como a gateway: status + payment_status + e-mail. */
export async function confirmOrderPaymentLikeGateway(
  supabaseAdmin: SupabaseAdmin,
  orderId: string,
): Promise<void> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error("Pedido não encontrado.");

  if (order.status === "confirmed" && (order.payment_status === "confirmed" || order.payment_status === "paid")) {
    return;
  }

  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      status: "confirmed",
      payment_status: "confirmed",
    })
    .eq("id", orderId);
  if (updErr) throw new Error(updErr.message);

  try {
    const { sendOrderPaidEmail } = await import("@/lib/order-email");
    await sendOrderPaidEmail(orderId);
  } catch (e) {
    console.error("confirmOrderPaymentLikeGateway: email failed", e);
  }
}

export function newPixReceiptToken(): string {
  return newId();
}

const UploadInput = z.object({
  orderId: z.string().uuid(),
  token: z.string().uuid().optional().nullable(),
  filename: z.string().min(1).max(200),
  mime: z.string().min(1),
  dataBase64: z.string().min(1),
});

export const uploadPixReceipt = createServerFn({ method: "POST" })
  .inputValidator((d) => UploadInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mime = data.mime.toLowerCase().trim();
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error("Envie apenas imagem JPEG, PNG ou WebP.");
    }

    const base64 = data.dataBase64.replace(/^data:[^;]+;base64,/, "");
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(base64);
    } catch {
      throw new Error("Arquivo inválido.");
    }
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > MAX_BYTES) throw new Error("Arquivo maior que 5 MB.");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_method, payment_status, user_id, customer_email, pix_receipt_path, pix_receipt_token",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido não encontrado.");

    const row = order as OrderRow;
    const block = canAcceptReceipt(row);
    if (block) throw new Error(block);

    await assertUploadAccess(supabaseAdmin, row, data.token);

    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${row.id}/${newId()}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message || "Falha no upload do comprovante.");

    const uploadedAt = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        pix_receipt_path: path,
        pix_receipt_mime: mime,
        pix_receipt_uploaded_at: uploadedAt,
      })
      .eq("id", row.id)
      .is("pix_receipt_path", null)
      .select("id")
      .maybeSingle();

    if (updErr || !updated) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error("Já existe um comprovante neste pedido.");
    }

    return {
      ok: true as const,
      uploadedAt,
      mime,
    };
  });

export const getPixReceiptSignedUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, pix_receipt_path, pix_receipt_mime")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order?.pix_receipt_path) throw new Error("Comprovante não encontrado.");

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(order.pix_receipt_path, 60 * 10);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || "Falha ao gerar URL.");

    return {
      url: signed.signedUrl,
      mime: order.pix_receipt_mime,
      expiresIn: 600,
    };
  });

export const confirmPaymentFromReceipt = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, payment_method, pix_receipt_path, status, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido não encontrado.");
    if (!order.pix_receipt_path) throw new Error("Este pedido não tem comprovante.");

    await confirmOrderPaymentLikeGateway(supabaseAdmin, order.id);

    return { ok: true as const, status: "confirmed", payment_status: "confirmed" };
  });
