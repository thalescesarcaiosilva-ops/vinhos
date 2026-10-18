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


