import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PurchaseGiftProduct = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  stock: number;
};

export async function fetchPurchaseGift(): Promise<PurchaseGiftProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, image_url, stock")
    .eq("is_purchase_gift", true)
    .eq("is_active", true)
    .order("stock", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as PurchaseGiftProduct;
}

export function usePurchaseGift() {
  return useQuery({
    queryKey: ["purchase-gift"],
    queryFn: fetchPurchaseGift,
    staleTime: 5 * 60_000,
  });
}
