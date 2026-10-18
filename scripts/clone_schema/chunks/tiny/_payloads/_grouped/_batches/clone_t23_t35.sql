-- >>> 20260604000904_ad3c6fd7-c14b-4363-8662-7c7c81060be2.sql
ALTER TABLE public.categories RENAME COLUMN banner_url TO banner_image;


-- >>> 20260604001026_0c858eee-e41f-469e-a0a2-d85869214d9d.sql
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS touch_categories_updated_at ON public.categories;
CREATE TRIGGER touch_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();


-- >>> 20260604020352_19cb24f0-cdf3-41df-a4f6-f4c49d707bcc.sql
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


-- >>> 20260604020416_8e64911b-fbcc-4f78-b5d4-238aad561c76.sql
DROP POLICY IF EXISTS "Anyone subscribes" ON public.newsletter_subscribers;
CREATE POLICY "Anyone subscribes"
  ON public.newsletter_subscribers FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 5 AND 320
    AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND is_active = true
  );


-- >>> 20260604024253_1e05409a-8246-4e37-b8a0-e09dd6fc5ed9.sql
-- Restore Data API grants lost in previous security migration
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT SELECT ON public.product_grapes TO anon, authenticated;
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT SELECT ON public.collections TO anon, authenticated;
GRANT SELECT ON public.grapes TO anon, authenticated;
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;

-- Admin write capabilities (RLS still gates by has_role)
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_grapes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.regions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.grapes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

-- Authenticated-only tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT, UPDATE ON public.newsletter_subscribers TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

-- Guest checkout (anon can create orders + insert items per existing RLS policies)
GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.order_items TO anon;
GRANT INSERT ON public.newsletter_subscribers TO anon;

-- Service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;


-- >>> 20260604025043_d029ead5-ce1e-4910-a460-f21ae8fb60f4.sql
DROP POLICY IF EXISTS "Public read active products" ON public.products;
CREATE POLICY "Public read active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public read active banners" ON public.banners;
CREATE POLICY "Public read active banners"
ON public.banners
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
CREATE POLICY "Public read active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public read approved reviews" ON public.reviews;
CREATE POLICY "Public read approved reviews"
ON public.reviews
FOR SELECT
TO anon, authenticated
USING (is_approved = true);

CREATE POLICY "Users read own reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins read all reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));


-- >>> 20260604163115_6d14f72b-68ff-47de-95c7-962de4ad767a.sql
-- Add Pagou-related columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pagou_transaction_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_expiration timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_pagou_tx ON public.orders(pagou_transaction_id);

-- Webhook events table for deduplication
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pagou_event_id text UNIQUE,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read webhook events"
  ON public.webhook_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));


-- >>> 20260604165411_48d072d3-bead-46a9-9574-717bc2f7ec8b.sql
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT ALL ON public.webhook_events TO service_role;


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


-- >>> 20260611144036_889e65d6-e02d-48b2-9cc3-e1b0a4db57e5.sql
DROP TRIGGER IF EXISTS products_derive_taxonomy ON public.products;
CREATE TRIGGER products_derive_taxonomy
BEFORE INSERT OR UPDATE OF name, description, short_description, wine_type, product_type, color
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.derive_product_taxonomy();

DROP TRIGGER IF EXISTS products_sync_categories ON public.products;
CREATE TRIGGER products_sync_categories
AFTER INSERT OR UPDATE OF product_type, color, is_zero_alcohol, name
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_product_categories();


-- >>> 20260611182007_87abc633-8cac-4b26-8e5c-81362f86985c.sql
CREATE TABLE public.contact_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT INSERT ON public.contact_messages TO anon;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit contact messages" ON public.contact_messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Only authenticated users/admins can view contact messages" ON public.contact_messages
    FOR SELECT TO authenticated USING (true);


-- >>> 20260612014521_29cf320c-8dca-4129-a179-0bde8c23c8c0.sql
-- Restrict contact_messages SELECT to admins only
DROP POLICY IF EXISTS "Only authenticated users/admins can view contact messages" ON public.contact_messages;
CREATE POLICY "Admins can view contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Remove overly permissive INSERT on orders (orders are created server-side via service role)
DROP POLICY IF EXISTS "Anyone can create order" ON public.orders;

-- Remove overly permissive INSERT on order_items (order_items are inserted server-side via service role)
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;


-- >>> 20260613173106_777d23ab-d13b-4876-ab74-887f6fdba189.sql
DROP POLICY IF EXISTS "Auth users read active coupons" ON public.coupons;


