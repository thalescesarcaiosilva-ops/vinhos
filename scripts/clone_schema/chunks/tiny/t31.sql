-- >>> 20260611132513_2bcf5048-a61b-4aa4-8da1-58af2fc97057.sql
DROP POLICY IF EXISTS "Users create own redemptions" ON public.coupon_redemptions;
CREATE POLICY "Users create own redemptions"
ON public.coupon_redemptions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    order_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  )
);


