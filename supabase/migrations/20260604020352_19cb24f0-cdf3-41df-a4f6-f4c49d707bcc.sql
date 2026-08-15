
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_product_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.derive_product_taxonomy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_categories(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_purchased(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Anyone can create order" ON public.orders;
CREATE POLICY "Anyone can create order"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items"
  ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id IS NULL OR o.user_id = auth.uid())
        AND o.created_at > now() - interval '1 hour'
    )
  );

CREATE POLICY "Admins read product videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins upload product videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update product videos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete product videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
