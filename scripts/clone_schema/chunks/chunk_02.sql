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


-- >>> 20260710203600_discount_without_compare_price.sql
-- Desconto de 30% no preço de venda, sem preço riscado (compare_at_price).
-- O valor cheio fica em compare_at_price temporariamente para o cálculo; depois é limpo.
UPDATE public.products
SET
  price = ROUND(GREATEST(price, COALESCE(compare_at_price, price)) * 0.7, 2),
  compare_at_price = NULL
WHERE is_active = true;


-- >>> 20260711232200_dedupe_and_combo_discount.sql
-- Desativar duplicatas exatas e aplicar 15% em combos (executado via scripts/fix-duplicates-and-combos.mjs)
-- Registro apenas; alterações aplicadas em 2026-07-11.


-- >>> 20260713150000_search_products_unaccent.sql
-- Busca de produtos com suporte a acentos (unaccent)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.search_products(
  q text DEFAULT NULL,
  filter_country text DEFAULT NULL,
  filter_grape text DEFAULT NULL,
  filter_wine_type text DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  price numeric,
  compare_at_price numeric,
  image_url text,
  country text,
  grape text,
  wine_type text,
  rating numeric,
  short_description text,
  brand text,
  featured boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH tokens AS (
    SELECT trim(t) AS token
    FROM unnest(regexp_split_to_array(coalesce(trim(q), ''), '\s+')) AS t
    WHERE length(trim(t)) >= 2
  )
  SELECT
    p.id,
    p.name,
    p.slug,
    p.price,
    p.compare_at_price,
    p.image_url,
    p.country,
    p.grape,
    p.wine_type,
    p.rating,
    p.short_description,
    p.brand,
    p.featured
  FROM public.products p
  WHERE p.is_active = true
    AND (filter_country IS NULL OR p.country ILIKE filter_country)
    AND (filter_grape IS NULL OR p.grape ILIKE '%' || filter_grape || '%')
    AND (filter_wine_type IS NULL OR p.wine_type ILIKE filter_wine_type)
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
    AND (
      NOT EXISTS (SELECT 1 FROM tokens)
      OR NOT EXISTS (
        SELECT 1
        FROM tokens tk
        WHERE NOT (
          extensions.unaccent(lower(p.name)) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.short_description, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.grape, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.brand, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.country, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
        )
      )
    )
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_products TO anon, authenticated;


-- >>> 20260723143000_pix_receipt_comprovante.sql
-- Comprovante Pix: colunas no pedido + bucket privado
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_receipt_path text,
  ADD COLUMN IF NOT EXISTS pix_receipt_mime text,
  ADD COLUMN IF NOT EXISTS pix_receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pix_receipt_token text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_pix_receipt_token_uidx
  ON public.orders (pix_receipt_token)
  WHERE pix_receipt_token IS NOT NULL;

COMMENT ON COLUMN public.orders.pix_receipt_path IS 'Caminho do comprovante no bucket privado pix-receipts';
COMMENT ON COLUMN public.orders.pix_receipt_token IS 'Token de upload para convidado (checkout Pix)';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pix-receipts',
  'pix-receipts',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- Admin autenticado pode ler objetos do bucket (signed URL ainda é preferível via server).
DROP POLICY IF EXISTS "Admins read pix receipts" ON storage.objects;
CREATE POLICY "Admins read pix receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pix-receipts' AND public.has_role(auth.uid(), 'admin'::public.app_role));


-- >>> 20260727133858_order_items_read_by_email.sql
-- Cliente que vê o pedido pelo e-mail da conta também precisa ler os itens.
-- Antes: orders tinha "Users read orders by matching email", mas order_items
-- só liberava quando orders.user_id = auth.uid() → UI mostrava "0 item(s)".

DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Users read own order items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.user_id = (SELECT auth.uid())
          OR (
            o.customer_email IS NOT NULL
            AND lower(o.customer_email) = lower(COALESCE((SELECT auth.jwt() ->> 'email'), ''))
          )
        )
    )
  );

-- Histórico do pedido: mesma regra de ownership
DROP POLICY IF EXISTS "Users read own order history" ON public.order_status_history;
CREATE POLICY "Users read own order history"
  ON public.order_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND (
          o.user_id = (SELECT auth.uid())
          OR public.has_role((SELECT auth.uid()), 'admin')
          OR (
            o.customer_email IS NOT NULL
            AND lower(o.customer_email) = lower(COALESCE((SELECT auth.jwt() ->> 'email'), ''))
          )
        )
    )
  );

-- Vincular pedidos órfãos ao usuário cadastrado com o mesmo e-mail
UPDATE public.orders o
SET user_id = u.id
FROM auth.users u
WHERE o.user_id IS NULL
  AND o.customer_email IS NOT NULL
  AND u.email IS NOT NULL
  AND lower(trim(o.customer_email)) = lower(u.email);


-- >>> 20260727230229_link_guest_orders_on_auth.sql
-- Vincula pedidos feitos como convidado (user_id null) à conta quando
-- o cliente se cadastra ou chama a função após login, pelo mesmo e-mail.

CREATE OR REPLACE FUNCTION public.link_guest_orders_to_user(p_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Cliente autenticado só pode vincular a si mesmo
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT lower(trim(email)) INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.orders
  SET user_id = p_user_id
  WHERE user_id IS NULL
    AND customer_email IS NOT NULL
    AND lower(trim(customer_email)) = v_email;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.link_guest_orders_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_guest_orders_to_user(uuid) TO authenticated, service_role;

-- Ao criar conta, puxa pedidos guest com o mesmo e-mail
CREATE OR REPLACE FUNCTION public.on_auth_user_created_link_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.link_guest_orders_to_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_orders ON auth.users;
CREATE TRIGGER on_auth_user_created_link_orders
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_auth_user_created_link_orders();

-- Garante policy de leitura por e-mail (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.orders'::regclass
      AND polname = 'Users read orders by matching email'
  ) THEN
    CREATE POLICY "Users read orders by matching email"
      ON public.orders
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND customer_email IS NOT NULL
        AND lower(customer_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      );
  END IF;
END $$;


-- >>> 20260825140000_country_categories_kind_and_sync.sql
-- País como coleção: coluna kind + sync de product_categories por country
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind text;

COMMENT ON COLUMN public.categories.kind IS 'country | type | combo | null (legado)';

-- Marcar categorias-país existentes
UPDATE public.categories
SET kind = 'country'
WHERE slug IN (
  'africa-do-sul','alemanha','argentina','australia','austria','brasil','bulgaria',
  'chile','eslovenia','espanha','eua','franca','israel','italia','macedonia-do-norte',
  'marrocos','moldavia','nova-zelandia','portugal','uruguai'
);

-- Tipos / combos
UPDATE public.categories
SET kind = 'type'
WHERE slug IN (
  'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
  'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
  'so-sangrias','sangrias'
)
AND kind IS NULL;

UPDATE public.categories
SET kind = 'combo'
WHERE slug LIKE 'combos%'
AND kind IS NULL;

-- Sync: inclui categoria-país a partir de products.country (além de tipo/combo)
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
  country_slug text;
  country_label text;
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name, country
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

  -- Categoria-país (coleção adicional) a partir de products.country
  country_label := trim(coalesce(p.country, ''));
  IF country_label IN ('EUA', 'USA', 'eua') THEN
    country_label := 'Estados Unidos';
  END IF;
  IF country_label <> '' THEN
    SELECT c.slug INTO country_slug
      FROM public.categories c
     WHERE c.kind = 'country'
       AND c.is_active = true
       AND (
         c.name = country_label
         OR (country_label = 'Estados Unidos' AND c.slug = 'eua')
       )
     LIMIT 1;
    IF country_slug IS NOT NULL THEN
      cat_slugs := cat_slugs || ARRAY[country_slug];
    END IF;
  END IF;

  -- Remove só vínculos derivados (tipo/combo/país), preserva seleções manuais fora desta lista
  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (
       c.kind = 'country'
       OR c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ])
     );

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;


-- >>> 20260907220000_banners_intrinsic_size.sql
-- Dimensões da arte original de cada banner.
-- Sem elas o <img> do hero não reserva altura e a home sofre CLS de ~0,39
-- quando o banner termina de carregar e empurra o conteúdo abaixo.
alter table public.banners
  add column if not exists width integer,
  add column if not exists height integer;

comment on column public.banners.width is
  'Largura em px da arte original. Usada para reservar a caixa do banner (CLS) e limitar o srcset.';
comment on column public.banners.height is
  'Altura em px da arte original. Usada junto com width para a proporção exata (nunca corta).';


-- >>> 20260918165917_enable_rls_seed_sql_parts.sql
-- Tabela auxiliar de seed: não deve ser acessível via Data API pública.
alter table public._seed_sql_parts enable row level security;

revoke all on table public._seed_sql_parts from anon, authenticated, public;

-- Sem policies: apenas service_role/postgres (bypassrls) acessam.


-- >>> 20260926160500_add_support_app_role.sql
-- Papel exclusivo do painel de suporte. Não concede acesso ao admin da loja.
-- Novo valor de enum só pode ser usado depois deste comando estar commitado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';


-- >>> 20260926160600_support_unpaid_orders_rls.sql
-- Pedidos visíveis ao suporte: gerados, ainda pendentes, sem pagamento, há mais de 15 minutos.
CREATE OR REPLACE FUNCTION public.order_is_unpaid_followup(
  p_status public.order_status,
  p_payment_status text,
  p_created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_status = 'pending'::public.order_status
    AND p_created_at <= (now() - interval '15 minutes')
    AND (
      p_payment_status IS NULL
      OR lower(btrim(p_payment_status)) IN ('pending', 'waiting', 'waiting_payment', 'processing')
    );
$$;

REVOKE ALL ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support reads abandoned unpaid orders" ON public.orders;
CREATE POLICY "Support reads abandoned unpaid orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND public.order_is_unpaid_followup(status, payment_status, created_at)
  );

DROP POLICY IF EXISTS "Support reads items of abandoned unpaid orders" ON public.order_items;
CREATE POLICY "Support reads items of abandoned unpaid orders"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE INDEX IF NOT EXISTS idx_orders_pending_created_at
  ON public.orders (created_at DESC)
  WHERE status = 'pending';


-- >>> 20260926220000_support_followup_includes_cancelled.sql
-- Fila do suporte: pedido com mais de 15 minutos, ainda sem pagamento ou cancelado.
CREATE OR REPLACE FUNCTION public.order_is_unpaid_followup(
  p_status public.order_status,
  p_payment_status text,
  p_created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_created_at <= (now() - interval '15 minutes')
    AND p_status IN ('pending'::public.order_status, 'cancelled'::public.order_status)
    AND (
      p_payment_status IS NULL
      OR lower(btrim(p_payment_status)) NOT IN ('confirmed', 'paid', 'approved')
    );
$$;

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_created_at
  ON public.orders (created_at DESC)
  WHERE status = 'cancelled';


-- >>> 20260926230000_support_order_contacts.sql
-- Marca de “já enviei mensagem” na fila de suporte. Não libera alteração do pedido.
CREATE TABLE public.support_order_contacts (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_order_contacts TO authenticated;
GRANT ALL ON public.support_order_contacts TO service_role;

ALTER TABLE public.support_order_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support reads followup contact marks"
  ON public.support_order_contacts
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support inserts followup contact marks"
  ON public.support_order_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support updates followup contact marks"
  ON public.support_order_contacts
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support deletes followup contact marks"
  ON public.support_order_contacts
  FOR DELETE
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );


-- >>> 20260926233000_support_cancel_order.sql
-- Suporte pode marcar o pedido da fila como cancelado, e só isso.
CREATE OR REPLACE FUNCTION public.guard_support_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  column_name text;
BEGIN
  IF public.has_role((SELECT auth.uid()), 'admin') OR NOT public.has_role((SELECT auth.uid()), 'support') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'cancelled'::public.order_status THEN
    RAISE EXCEPTION 'Suporte só pode cancelar o pedido';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND lower(btrim(COALESCE(NEW.payment_status, ''))) IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Suporte só pode cancelar o pedido';
  END IF;

  FOR column_name IN SELECT jsonb_object_keys(new_row)
  LOOP
    IF column_name IN ('status', 'payment_status') THEN
      CONTINUE;
    END IF;
    IF new_row -> column_name IS DISTINCT FROM old_row -> column_name THEN
      RAISE EXCEPTION 'Suporte só pode cancelar o pedido';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_support_order_cancel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_support_order_cancel() TO authenticated, service_role;

DROP TRIGGER IF EXISTS orders_guard_support_cancel ON public.orders;
CREATE TRIGGER orders_guard_support_cancel
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_support_order_cancel();

DROP POLICY IF EXISTS "Support cancels followup orders" ON public.orders;
CREATE POLICY "Support cancels followup orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND status = 'pending'::public.order_status
    AND public.order_is_unpaid_followup(status, payment_status, created_at)
  )
  WITH CHECK (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND status = 'cancelled'::public.order_status
    AND public.order_is_unpaid_followup(status, payment_status, created_at)
  );


-- >>> 20261006120000_mais_vendidos_collection.sql
-- Coleção estática "Mais Vendidos" (slug: mais-vendidos).
-- kind = featured: não entra no menu (menu só usa type/combo/country).
-- sync_product_categories não remove este vínculo (só apaga type/combo/country).
-- Snapshot dos 25 produtos com maior receita em pedidos pagos no momento da criação.
-- Não atualiza automaticamente quando as vendas mudam.

INSERT INTO public.categories (name, slug, description, kind, is_active, sort_order)
VALUES (
  'Mais Vendidos',
  'mais-vendidos',
  'Os 25 produtos com maior receita em pedidos pagos da loja.',
  'featured',
  true,
  9999
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  is_active = true,
  updated_at = now();

WITH top25 AS (
  SELECT oi.product_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.product_id IS NOT NULL
    AND p.is_active = true
    AND (
      o.status IN (
        'confirmed',
        'paid',
        'separating',
        'invoiced',
        'shipped',
        'out_for_delivery',
        'delivered'
      )
      OR o.payment_status = 'confirmed'
    )
  GROUP BY oi.product_id
  ORDER BY sum(oi.total) DESC
  LIMIT 25
),
cat AS (
  SELECT id FROM public.categories WHERE slug = 'mais-vendidos'
)
DELETE FROM public.product_categories pc
USING cat
WHERE pc.category_id = cat.id;

WITH top25 AS (
  SELECT oi.product_id, sum(oi.total) AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.product_id IS NOT NULL
    AND p.is_active = true
    AND (
      o.status IN (
        'confirmed',
        'paid',
        'separating',
        'invoiced',
        'shipped',
        'out_for_delivery',
        'delivered'
      )
      OR o.payment_status = 'confirmed'
    )
  GROUP BY oi.product_id
  ORDER BY revenue DESC
  LIMIT 25
),
cat AS (
  SELECT id FROM public.categories WHERE slug = 'mais-vendidos'
)
INSERT INTO public.product_categories (product_id, category_id)
SELECT t.product_id, cat.id
FROM top25 t
CROSS JOIN cat
ON CONFLICT DO NOTHING;


-- >>> 20261014190000_purchase_gift_and_exclude_from_feed.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS exclude_from_feed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_purchase_gift boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.exclude_from_feed IS 'Omite o produto do feed Google Merchant e do sitemap.';
COMMENT ON COLUMN public.products.is_purchase_gift IS 'Brinde automático (1 un., R$ 0) em qualquer compra com item pago.';

CREATE INDEX IF NOT EXISTS products_purchase_gift_idx
  ON public.products (id)
  WHERE is_purchase_gift = true;

CREATE OR REPLACE FUNCTION public.products_gift_excludes_feed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_purchase_gift IS TRUE THEN
    NEW.exclude_from_feed := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_gift_excludes_feed ON public.products;
CREATE TRIGGER products_gift_excludes_feed
  BEFORE INSERT OR UPDATE OF is_purchase_gift
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_gift_excludes_feed();

UPDATE public.products
SET is_purchase_gift = true,
    exclude_from_feed = true
WHERE slug = 'jogo-de-2-tacas-de-cristal-classic-galvao-vinhos';

CREATE OR REPLACE FUNCTION public.search_products(
  q text DEFAULT NULL,
  filter_country text DEFAULT NULL,
  filter_grape text DEFAULT NULL,
  filter_wine_type text DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  price numeric,
  compare_at_price numeric,
  image_url text,
  country text,
  grape text,
  wine_type text,
  rating numeric,
  short_description text,
  brand text,
  featured boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH tokens AS (
    SELECT trim(t) AS token
    FROM unnest(regexp_split_to_array(coalesce(trim(q), ''), '\s+')) AS t
    WHERE length(trim(t)) >= 2
  )
  SELECT
    p.id,
    p.name,
    p.slug,
    p.price,
    p.compare_at_price,
    p.image_url,
    p.country,
    p.grape,
    p.wine_type,
    p.rating,
    p.short_description,
    p.brand,
    p.featured
  FROM public.products p
  WHERE p.is_active = true
    AND p.is_purchase_gift = false
    AND (filter_country IS NULL OR p.country ILIKE filter_country)
    AND (filter_grape IS NULL OR p.grape ILIKE '%' || filter_grape || '%')
    AND (filter_wine_type IS NULL OR p.wine_type ILIKE filter_wine_type)
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
    AND (
      NOT EXISTS (SELECT 1 FROM tokens)
      OR NOT EXISTS (
        SELECT 1
        FROM tokens tk
        WHERE NOT (
          extensions.unaccent(lower(p.name)) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.short_description, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.grape, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.brand, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.country, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
        )
      )
    )
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_products TO anon, authenticated;


-- >>> 20261014193000_search_includes_purchase_gift.sql
-- O jogo de taças (e outros brindes) continua vendável; a busca não deve omiti-los.
CREATE OR REPLACE FUNCTION public.search_products(
  q text DEFAULT NULL,
  filter_country text DEFAULT NULL,
  filter_grape text DEFAULT NULL,
  filter_wine_type text DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  price numeric,
  compare_at_price numeric,
  image_url text,
  country text,
  grape text,
  wine_type text,
  rating numeric,
  short_description text,
  brand text,
  featured boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH tokens AS (
    SELECT trim(t) AS token
    FROM unnest(regexp_split_to_array(coalesce(trim(q), ''), '\s+')) AS t
    WHERE length(trim(t)) >= 2
  )
  SELECT
    p.id,
    p.name,
    p.slug,
    p.price,
    p.compare_at_price,
    p.image_url,
    p.country,
    p.grape,
    p.wine_type,
    p.rating,
    p.short_description,
    p.brand,
    p.featured
  FROM public.products p
  WHERE p.is_active = true
    AND (filter_country IS NULL OR p.country ILIKE filter_country)
    AND (filter_grape IS NULL OR p.grape ILIKE '%' || filter_grape || '%')
    AND (filter_wine_type IS NULL OR p.wine_type ILIKE filter_wine_type)
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
    AND (
      NOT EXISTS (SELECT 1 FROM tokens)
      OR NOT EXISTS (
        SELECT 1
        FROM tokens tk
        WHERE NOT (
          extensions.unaccent(lower(p.name)) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.short_description, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.grape, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.brand, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
          OR extensions.unaccent(lower(coalesce(p.country, ''))) LIKE '%' || extensions.unaccent(lower(tk.token)) || '%'
        )
      )
    )
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_products TO anon, authenticated;


-- >>> 20261016180000_remove_purchase_gift.sql
-- Remove brinde de primeira compra: política do rodapé, flags e trigger.

UPDATE public.store_settings
SET data = jsonb_set(
  data,
  '{footer,institutional}',
  COALESCE(
    (
      SELECT jsonb_agg(page ORDER BY ordinality)
      FROM jsonb_array_elements(COALESCE(data->'footer'->'institutional', '[]'::jsonb))
        WITH ORDINALITY AS t(page, ordinality)
      WHERE page->>'slug' IS DISTINCT FROM 'brinde-de-primeira-compra'
    ),
    '[]'::jsonb
  )
)
WHERE id = 'singleton';

DROP TRIGGER IF EXISTS products_gift_excludes_feed ON public.products;
DROP FUNCTION IF EXISTS public.products_gift_excludes_feed();
DROP INDEX IF EXISTS public.products_purchase_gift_idx;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS is_purchase_gift,
  DROP COLUMN IF EXISTS exclude_from_feed;


-- >>> 20261018010000_import_splendore_categories.sql
-- Categorias para catálogo Splendore (destilados, acessórios, cervejas, gourmet) + países faltantes.

INSERT INTO public.categories (name, slug, kind, parent_id, sort_order, is_active)
SELECT v.name, v.slug, v.kind, NULL, v.sort_order, true
FROM (VALUES
  ('Destilados', 'destilados', 'type', 40),
  ('Acessórios', 'acessorios', 'type', 50),
  ('Cervejas', 'cervejas', 'type', 60),
  ('Gourmet', 'gourmet', 'type', 70),
  ('Escócia', 'escocia', 'country', 200),
  ('Inglaterra', 'inglaterra', 'country', 201),
  ('Reino Unido', 'reino-unido', 'country', 202),
  ('México', 'mexico', 'country', 203),
  ('Japão', 'japao', 'country', 204),
  ('Holanda', 'holanda', 'country', 205),
  ('Suécia', 'suecia', 'country', 206),
  ('Polônia', 'polonia', 'country', 207),
  ('Irlanda', 'irlanda', 'country', 208),
  ('Canadá', 'canada', 'country', 209),
  ('Croácia', 'croacia', 'country', 210),
  ('Cuba', 'cuba', 'country', 211),
  ('Grécia', 'grecia', 'country', 212)
) AS v(name, slug, kind, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.slug = v.slug
);

INSERT INTO public.categories (name, slug, kind, parent_id, sort_order, is_active)
SELECT v.name, v.slug, 'type', p.id, v.sort_order, true
FROM (VALUES
  ('Whisky', 'whisky', 'destilados', 1),
  ('Gin', 'gin', 'destilados', 2),
  ('Vodka', 'vodka', 'destilados', 3),
  ('Rum', 'rum', 'destilados', 4),
  ('Tequila', 'tequila', 'destilados', 5),
  ('Cachaça', 'cachaca', 'destilados', 6),
  ('Licor', 'licor', 'destilados', 7),
  ('Conhaque e Brandy', 'conhaque-brandy', 'destilados', 8),
  ('Pisco', 'pisco', 'destilados', 9),
  ('Outros destilados', 'outros-destilados', 'destilados', 10),
  ('Taças', 'tacas', 'acessorios', 1),
  ('Acessórios para Garrafas', 'acessorios-garrafas', 'acessorios', 2)
) AS v(name, slug, parent_slug, sort_order)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.slug = v.slug
);

-- Amplia sync automático para destilados, acessórios, cervejas e gourmet.
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
  country_slug text;
  country_label text;
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name, country
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

  ELSIF p.product_type = 'cerveja' THEN
    cat_slugs := cat_slugs || ARRAY['cervejas'];

  ELSIF p.product_type = 'gourmet' THEN
    cat_slugs := cat_slugs || ARRAY['gourmet'];

  ELSIF p.product_type = 'acessorio' THEN
    cat_slugs := cat_slugs || ARRAY['acessorios'];
    IF nm ~ '(ta[cç]a|copo|glass)' THEN
      cat_slugs := cat_slugs || ARRAY['tacas'];
    ELSIF nm ~ '(saca.?rolha|decanter|abridor|dosador|bico|coqueteleira|peneira|case porta)' THEN
      cat_slugs := cat_slugs || ARRAY['acessorios-garrafas'];
    END IF;

  ELSIF p.product_type = 'destilado' THEN
    cat_slugs := cat_slugs || ARRAY['destilados'];
    IF nm ~ 'whisky|whiskey|bourbon|scotch' THEN
      cat_slugs := cat_slugs || ARRAY['whisky'];
    ELSIF nm ~ '\mgin\M' OR nm ~ '^gin ' THEN
      cat_slugs := cat_slugs || ARRAY['gin'];
    ELSIF nm ~ 'vodka' THEN
      cat_slugs := cat_slugs || ARRAY['vodka'];
    ELSIF nm ~ '\mrum\M|rhum' THEN
      cat_slugs := cat_slugs || ARRAY['rum'];
    ELSIF nm ~ 'tequila|mezcal' THEN
      cat_slugs := cat_slugs || ARRAY['tequila'];
    ELSIF nm ~ 'cacha[cç]a' THEN
      cat_slugs := cat_slugs || ARRAY['cachaca'];
    ELSIF nm ~ 'licor|liqueur|amaro|aperitivo' THEN
      cat_slugs := cat_slugs || ARRAY['licor'];
    ELSIF nm ~ 'conhaque|cognac|brandy|armagnac' THEN
      cat_slugs := cat_slugs || ARRAY['conhaque-brandy'];
    ELSIF nm ~ 'pisco' THEN
      cat_slugs := cat_slugs || ARRAY['pisco'];
    ELSE
      cat_slugs := cat_slugs || ARRAY['outros-destilados'];
    END IF;

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

  country_label := trim(coalesce(p.country, ''));
  IF country_label IN ('EUA', 'USA', 'eua') THEN
    country_label := 'Estados Unidos';
  END IF;
  IF country_label <> '' THEN
    SELECT c.slug INTO country_slug
      FROM public.categories c
     WHERE c.kind = 'country'
       AND c.is_active = true
       AND (
         c.name = country_label
         OR (country_label = 'Estados Unidos' AND c.slug = 'eua')
       )
     LIMIT 1;
    IF country_slug IS NOT NULL THEN
      cat_slugs := cat_slugs || ARRAY[country_slug];
    END IF;
  END IF;

  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (
       c.kind = 'country'
       OR c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias',
       'destilados','whisky','gin','vodka','rum','tequila','cachaca','licor','conhaque-brandy','pisco','outros-destilados',
       'acessorios','tacas','acessorios-garrafas','cervejas','gourmet'
     ])
     );

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;


-- >>> clone_storage_extras
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-videos', 'product-videos', false)
ON CONFLICT (id) DO NOTHING;