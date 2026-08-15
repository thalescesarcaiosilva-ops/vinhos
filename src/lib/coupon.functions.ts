import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ValidateInput = z.object({
  code: z.string().trim().min(1).max(64),
  subtotal: z.number().nonnegative(),
});

export const validateCouponFn = createServerFn({ method: "POST" })
  .inputValidator((d) => ValidateInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.trim().toUpperCase();

    const { data: row, error } = await supabaseAdmin
      .from("coupons")
      .select("code, type, value, min_order_value, max_uses, uses_count, starts_at, expires_at, is_active")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return { ok: false as const, error: "Erro ao validar cupom" };
    if (!row) return { ok: false as const, error: "Cupom inválido" };

    const now = new Date();
    if (row.starts_at && new Date(row.starts_at) > now)
      return { ok: false as const, error: "Cupom ainda não está ativo" };
    if (row.expires_at && new Date(row.expires_at) < now)
      return { ok: false as const, error: "Cupom expirado" };
    if (row.max_uses != null && (row.uses_count ?? 0) >= row.max_uses)
      return { ok: false as const, error: "Cupom esgotado" };
    if (row.min_order_value != null && data.subtotal < Number(row.min_order_value))
      return { ok: false as const, error: `Pedido mínimo de R$ ${Number(row.min_order_value).toFixed(2)}` };

    const value = Number(row.value);
    const discount =
      row.type === "percent"
        ? Math.min(data.subtotal, (data.subtotal * value) / 100)
        : Math.min(data.subtotal, value);

    return {
      ok: true as const,
      code: row.code,
      type: row.type as "percent" | "fixed",
      value,
      discount,
    };
  });

export const listActiveCouponsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .select("code, description, type, value, min_order_value, starts_at, expires_at")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
});
