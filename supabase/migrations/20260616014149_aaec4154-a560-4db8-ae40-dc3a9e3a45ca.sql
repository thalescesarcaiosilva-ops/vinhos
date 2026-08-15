
-- ORDERS: explicit INSERT policies preventing users from forging another user's id
CREATE POLICY "orders_insert_self_or_guest"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "orders_insert_anon_guest"
ON public.orders
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- COUPON_REDEMPTIONS: immutable audit. Restrictive policies block any
-- UPDATE/DELETE from anon/authenticated; service_role bypasses RLS.
CREATE POLICY "coupon_redemptions_no_update"
ON public.coupon_redemptions
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "coupon_redemptions_no_delete"
ON public.coupon_redemptions
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);
