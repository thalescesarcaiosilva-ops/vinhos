import { validateCouponFn } from "@/lib/coupon.functions";

export type CouponResult = {
  ok: true;
  code: string;
  type: "percent" | "fixed";
  value: number;
  discount: number;
} | { ok: false; error: string };

export async function validateCoupon(rawCode: string, subtotal: number): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Informe um código" };
  try {
    return await validateCouponFn({ data: { code, subtotal } });
  } catch {
    return { ok: false, error: "Erro ao validar cupom" };
  }
}
