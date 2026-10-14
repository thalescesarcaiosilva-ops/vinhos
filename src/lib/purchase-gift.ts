import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PurchaseGiftProduct = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  stock: number;
  price: number;
};

/** Pedido que já conta como compra feita (não Pix pendente / cancelado). */
export const COMPLETED_PURCHASE_OR =
  "payment_status.eq.paid,status.in.(confirmed,paid,shipped,delivered,separating,invoiced,out_for_delivery)";

export async function fetchPurchaseGift(): Promise<PurchaseGiftProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, image_url, stock, price")
    .eq("is_purchase_gift", true)
    .eq("is_active", true)
    .order("stock", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    price: Number(data.price),
  } as PurchaseGiftProduct;
}

export function usePurchaseGift() {
  return useQuery({
    queryKey: ["purchase-gift"],
    queryFn: fetchPurchaseGift,
    staleTime: 5 * 60_000,
  });
}

export async function fetchUserHasCompletedPurchase(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or(COMPLETED_PURCHASE_OR);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Primeira compra: visitante sem login sempre se qualifica.
 * Só deixa de ser primeira compra com conta logada que já tem pedido pago.
 */
export function useFirstPurchaseEligible() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["first-purchase-completed", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchUserHasCompletedPurchase(user!.id),
    staleTime: 60_000,
  });

  const ready = !loading && (!user || q.isFetched);
  const eligible = !user || q.data === false;
  return {
    eligible,
    ready,
    isReturningCustomer: Boolean(user && q.data === true),
  };
}
