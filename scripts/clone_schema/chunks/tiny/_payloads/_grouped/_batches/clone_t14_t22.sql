-- >>> 20260602040608_8c48e45a-8cd6-4eb9-bb00-432a943db4a1.sql
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
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti|moscatel)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';

    -- cor por palavra OU por varietal/uva
    has_t := (nm ~ '\m(tinto|tintos|red)\M')
          OR (nm ~ '\m(malbec|cabernet|merlot|pinot noir|primitivo|zinfandel|syrah|shiraz|tempranillo|sangiovese|nebbiolo|carmen[eè]re|tannat|bonarda|garnacha|grenache|montepulciano|nero d''avola|aglianico|appassimento|barbera|petit verdot|carignan)\M');
    has_b := (nm ~ '\m(branco|brancos|blanc|bianco|white)\M')
          OR (nm ~ '\m(chardonnay|sauvignon blanc|gewurztraminer|gew[uü]rztraminer|riesling|pinot gris|pinot grigio|vinho verde|viognier|alvarinho|albari[ñn]o|verdejo|fian[oô]|trebbiano|torront[eé]s|moscato|sem[ií]llon|gr[uü]ner|vermentino)\M')
          OR (nm ~ '\mvinho verde\M');
    has_r := (nm ~ '\m(ros[eé]|ros[eé]s|rosato|rosado)\M');

    -- distingue "branco + rosé" / "branco e rosé" / "rosé e branco" reforçando ambos
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

-- Re-sync all kits with the improved classifier
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type = 'kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;


-- >>> 20260602043152_464cf451-c825-43ce-9b38-519722ec8510.sql
-- 14 novas categorias espelhando o site fonte
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('vinhos-brancos','Vinhos Brancos',10),
  ('vinhos-roses','Vinhos Rosés',11),
  ('vinhos-frisantes','Vinhos Frisantes',12),
  ('vinhos-licorosos','Vinhos Licorosos',13),
  ('vinhos-sem-alcool','Vinhos Sem Álcool',14),
  ('champanhes','Champanhes',20),
  ('espumantes-brut','Espumantes Brut',21),
  ('espumantes-extra-brut','Espumantes Extra Brut',22),
  ('espumantes-secos','Espumantes Secos',23),
  ('espumantes-demi-sec','Espumantes Demi-Sec',24),
  ('espumantes-sem-alcool','Espumantes Sem Álcool',25),
  ('kits-de-vinhos-com-3-garrafas','Kits de Vinhos com 3 Garrafas',30),
  ('kits-de-vinhos-com-4-garrafas','Kits de Vinhos com 4 Garrafas',31),
  ('kits-de-vinhos-com-6-garrafas','Kits de Vinhos com 6 Garrafas',32)
ON CONFLICT (slug) DO NOTHING;


-- >>> 20260602162713_31025469-cbbc-4b51-b701-be7d3bb30481.sql
-- 1) store_settings: single-row key/value JSONB storage
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
CREATE POLICY "Public read store settings"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins write store settings" ON public.store_settings;
CREATE POLICY "Admins write store settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed defaults
INSERT INTO public.store_settings (id, data) VALUES (
  'singleton',
  jsonb_build_object(
    'shipping', jsonb_build_object(
      'freeShippingFrom', 300,
      'flatShipping', 29.9,
      'expressShipping', 49.9
    ),
    'payments', jsonb_build_object(
      'pixEnabled', true,
      'pixDiscount', 5,
      'boletoEnabled', true,
      'cardEnabled', true,
      'maxInstallments', 6,
      'minInstallment', 30,
      'interestFreeUpTo', 6,
      'monthlyInterest', 0
    ),
    'colors', jsonb_build_object(
      'primary', '#5a1a1f',
      'accent', '#c9a86a',
      'buy', '#2f9e4f'
    )
  )
) ON CONFLICT (id) DO NOTHING;

-- 2) categories: add banner_url
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS banner_url text;


-- >>> 20260603160545_598d9114-ea33-483c-a5cb-6300098e9dfe.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url text;



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


