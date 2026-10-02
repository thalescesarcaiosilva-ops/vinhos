import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ValidateInput = z.object({
  code: z.string().trim().min(1).max(64),
  subtotal: z.number().nonnegative(),
});

type CouponLookup = {
  from: (table: "coupons" | "coupon_redemptions" | "store_settings") => {
    select: (cols: string) => any;
    update: (values: Record<string, unknown>) => any;
    insert: (values: Record<string, unknown>) => any;
  };
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function discountForCoupon(type: string, value: number, subtotal: number) {
  if (type === "percent") return money(Math.min(subtotal, (subtotal * value) / 100));
  if (type === "fixed") return money(Math.min(subtotal, value));
  return 0;
}

export async function resolveCouponDiscount(
  supabaseAdmin: CouponLookup,
  rawCode: string | null | undefined,
  subtotal: number,
) {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) {
    return { ok: true as const, code: null, couponId: null, type: null, value: 0, discount: 0 };
  }

  const { data: row, error } = await supabaseAdmin
    .from("coupons")
    .select("id, code, type, value, min_order_value, max_uses, uses_count, starts_at, expires_at, is_active")
    .ilike("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false as const, error: "Erro ao validar cupom" };
  if (!row) return { ok: false as const, error: "Cupom inválido" };
  if (row.type !== "percent" && row.type !== "fixed") {
    return { ok: false as const, error: "Cupom inválido" };
  }

  const now = new Date();
  if (row.starts_at && new Date(row.starts_at) > now) {
    return { ok: false as const, error: "Cupom ainda não está ativo" };
  }
  if (row.expires_at && new Date(row.expires_at) < now) {
    return { ok: false as const, error: "Cupom expirado" };
  }
  if (row.max_uses != null && (row.uses_count ?? 0) >= row.max_uses) {
    return { ok: false as const, error: "Cupom esgotado" };
  }
  if (row.min_order_value != null && subtotal < Number(row.min_order_value)) {
    return { ok: false as const, error: `Pedido mínimo de R$ ${Number(row.min_order_value).toFixed(2)}` };
  }

  const value = Number(row.value);
  return {
    ok: true as const,
    code: row.code as string,
    couponId: row.id as string,
    type: row.type as "percent" | "fixed",
    value,
    discount: discountForCoupon(row.type, value, subtotal),
  };
}

export async function registerCouponUse(
  supabaseAdmin: CouponLookup,
  input: { couponId: string; orderId: string; userId: string | null; discount: number },
) {
  const { data: row } = await supabaseAdmin
    .from("coupons")
    .select("uses_count")
    .eq("id", input.couponId)
    .maybeSingle();
  await supabaseAdmin
    .from("coupons")
    .update({ uses_count: Number(row?.uses_count ?? 0) + 1 })
    .eq("id", input.couponId);
  await supabaseAdmin.from("coupon_redemptions").insert({
    coupon_id: input.couponId,
    order_id: input.orderId,
    user_id: input.userId,
    discount_value: input.discount,
  });
}

export const validateCouponFn = createServerFn({ method: "POST" })
  .inputValidator((d) => ValidateInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await resolveCouponDiscount(supabaseAdmin, data.code, data.subtotal);
    if (!result.ok || !result.code || !result.type) {
      return { ok: false as const, error: result.ok ? "Cupom inválido" : result.error };
    }
    return {
      ok: true as const,
      code: result.code,
      type: result.type,
      value: result.value,
      discount: result.discount,
    };
  });
