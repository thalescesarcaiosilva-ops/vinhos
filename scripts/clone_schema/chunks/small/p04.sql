-- >>> 20260603161235_de40078d-f9fc-4859-8bba-7c36e1a64105.sql
UPDATE public.products SET video_url = '/__l5e/assets-v1/8dd2a1bc-a017-43ea-a005-a42884c98682/casa-valduga-premivm-extra-brut.mp4' WHERE slug = 'casa-valduga-premivm-extra-brut';


-- >>> 20260603162646_f69d4933-7f2c-4daa-8f10-7ab3bb400a88.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aging text,
  ADD COLUMN IF NOT EXISTS alcohol_content text;


-- >>> 20260603163525_4a8997f7-162d-4f11-bb3a-efa4e1a86ba8.sql
CREATE TABLE IF NOT EXISTS public._product_chars_stg(
  slug text PRIMARY KEY,
  country text, region text, brand text, wine_type text,
  classification text, aging text, grape text, alcohol_content text,
  serving_temp text, visual_notes text, nose_notes text,
  palate_notes text, harmonization text
);
GRANT ALL ON public._product_chars_stg TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._product_chars_stg TO authenticated;
ALTER TABLE public._product_chars_stg ENABLE ROW LEVEL SECURITY;


-- >>> 20260603163602_981a1f9c-631a-4584-b7c4-3a71e75c1a27.sql
UPDATE public.products p SET
  country = COALESCE(s.country, p.country),
  region = COALESCE(s.region, p.region),
  brand = COALESCE(s.brand, p.brand),
  wine_type = COALESCE(s.wine_type, p.wine_type),
  classification = COALESCE(s.classification, p.classification),
  aging = COALESCE(s.aging, p.aging),
  grape = COALESCE(s.grape, p.grape),
  alcohol_content = COALESCE(s.alcohol_content, p.alcohol_content),
  serving_temp = COALESCE(s.serving_temp, p.serving_temp),
  visual_notes = COALESCE(s.visual_notes, p.visual_notes),
  nose_notes = COALESCE(s.nose_notes, p.nose_notes),
  palate_notes = COALESCE(s.palate_notes, p.palate_notes),
  harmonization = COALESCE(s.harmonization, p.harmonization)
FROM public._product_chars_stg s
WHERE p.slug = s.slug;

DROP TABLE public._product_chars_stg;


-- >>> 20260603180151_8080578e-2863-43b5-8566-e1e4f8d15f5f.sql
-- Legacy Lovable admin UUID; skip on fresh Supabase (admin is created in 20260611143701).
INSERT INTO public.user_roles (user_id, role)
SELECT 'c9ea104e-b169-4084-873f-52407ddd51ae', 'admin'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = 'c9ea104e-b169-4084-873f-52407ddd51ae'
)
ON CONFLICT (user_id, role) DO NOTHING;


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


-- >>> 20260613174959_f6841b78-f6fc-49b0-b41c-af997f2005bc.sql
UPDATE public.products SET image_url = replace(image_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE image_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.products SET video_url = replace(video_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE video_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.banners SET image_url = replace(image_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE image_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.categories SET banner_image = replace(banner_image, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE banner_image LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.profiles SET avatar_url = replace(avatar_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE avatar_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.order_items SET product_image = replace(product_image, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br') WHERE product_image LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.reviews SET photos = (
  SELECT jsonb_agg(
    CASE WHEN jsonb_typeof(elem) = 'string'
         THEN to_jsonb(replace(elem #>> '{}', 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://www.galvaovinhos.com.br'))
         ELSE elem END
  )
  FROM jsonb_array_elements(photos) elem
)
WHERE photos::text LIKE '%dymhoqxfamosdujzorrl.supabase.co%' AND jsonb_typeof(photos) = 'array';


-- >>> 20260616014149_aaec4154-a560-4db8-ae40-dc3a9e3a45ca.sql
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


-- >>> 20260616015821_76fff964-00d7-4c9e-9a27-37324a36bbb1.sql
CREATE OR REPLACE FUNCTION public.sync_product_categories(_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  cat_slugs text[];
  nm text;
  has_esp boolean;
  has_sang boolean;
  has_t boolean;
  has_b boolean;
  has_r boolean;
  color_count int;
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
    INTO p FROM public.products WHERE id = _product_id;
  IF p IS NULL THEN RETURN; END IF;

  cat_slugs := ARRAY[]::text[];
  nm := lower(coalesce(p.name,''));

  IF p.product_type = 'vinho' THEN
    IF p.color = 'tinto'  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','tintos']; END IF;
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','roses']; END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['vinhos-zero-alcool']; END IF;

  ELSIF p.product_type = 'espumante' THEN
    cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['espumantes-roses']; END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti|moscatel)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';

    has_t := (nm ~ '\m(tinto|tintos|red)\M')
          OR (nm ~ '\m(malbec|cabernet|merlot|pinot noir|primitivo|zinfandel|syrah|shiraz|tempranillo|sangiovese|nebbiolo|carmen[eè]re|tannat|bonarda|garnacha|grenache|montepulciano|nero d''avola|aglianico|appassimento|barbera|petit verdot|carignan)\M');
    has_b := (nm ~ '\m(branco|brancos|blanc|bianco|white)\M')
          OR (nm ~ '\m(chardonnay|sauvignon blanc|gewurztraminer|gew[uü]rztraminer|riesling|pinot gris|pinot grigio|vinho verde|viognier|alvarinho|albari[ñn]o|verdejo|fian[oô]|trebbiano|torront[eé]s|moscato|sem[ií]llon|gr[uü]ner|vermentino)\M')
          OR (nm ~ '\mvinho verde\M');
    has_r := (nm ~ '\m(ros[eé]|ros[eé]s|rosato|rosado)\M');

    IF nm ~ '\m(branco|brancos|blanc|bianco)\M.*(\+|\se\s|,).*(ros[eé]|rosato|rosado)' THEN
      has_b := true; has_r := true;
    END IF;
    IF nm ~ '\m(ros[eé]|rosato|rosado)\M.*(\+|\se\s|,).*(branco|brancos|blanc|bianco)' THEN
      has_b := true; has_r := true;
    END IF;

    IF has_sang AND NOT has_esp AND NOT has_t AND NOT has_b AND NOT (nm ~ '\m(vinho|vinhos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-sangrias','combos-sangrias'];

    ELSIF has_esp AND NOT has_t AND NOT (nm ~ '\m(vinho|vinhos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-zero-alcool']; END IF;

    ELSIF has_esp AND (has_t OR (nm ~ '\m(vinho|vinhos)\M')) THEN
      cat_slugs := cat_slugs || ARRAY['combos-vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-brancos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-ve-zero-alcool']; END IF;

    ELSE
      cat_slugs := cat_slugs || ARRAY['combos-so-vinhos'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-brancos-roses'];
      ELSIF has_t           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos'];
      ELSIF has_b           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-brancos'];
      ELSIF has_r           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-zero-alcool']; END IF;
    END IF;
  END IF;

  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ]));

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;


-- >>> 20260621000000_newsletter_phone.sql
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS phone TEXT;


-- >>> 20260624120000_remove_product_compare_prices.sql
-- Remove desconto de todos os produtos: preço de venda = preço cheio (o maior).
-- Limpa compare_at_price para não exibir preço riscado na loja.
UPDATE public.products
SET
  price = CASE
    WHEN compare_at_price IS NOT NULL AND compare_at_price > price THEN compare_at_price
    ELSE price
  END,
  compare_at_price = NULL
WHERE compare_at_price IS NOT NULL;


-- >>> 20260630120000_add_products_gtin.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gtin text;

COMMENT ON COLUMN public.products.gtin IS 'GTIN/EAN-13 para Google Merchant e identificação do produto';

CREATE INDEX IF NOT EXISTS idx_products_gtin ON public.products (gtin)
  WHERE gtin IS NOT NULL;


-- >>> 20260710180000_product_suggestions_and_discount.sql
-- Produtos sugeridos (até 3 por produto)
CREATE TABLE public.product_suggestions (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  suggested_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 2),
  PRIMARY KEY (product_id, suggested_product_id),
  CONSTRAINT product_suggestions_no_self CHECK (product_id != suggested_product_id),
  UNIQUE (product_id, sort_order)
);

GRANT SELECT ON public.product_suggestions TO anon, authenticated;
GRANT ALL ON public.product_suggestions TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_suggestions TO authenticated;

ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product_suggestions"
ON public.product_suggestions FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins write product_suggestions"
ON public.product_suggestions FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_product_suggestions_product ON public.product_suggestions(product_id);

-- Desconto de 30% em todos os produtos ativos (preço de venda, sem preço riscado)
UPDATE public.products
SET
  price = ROUND(GREATEST(price, COALESCE(compare_at_price, price)) * 0.7, 2),
  compare_at_price = NULL
WHERE is_active = true;


