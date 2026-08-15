
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
  has_vinho boolean;
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
    IF p.color = 'misto'  THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';
    has_vinho := nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos|ros[eé]|ros[eé]s)\M' AND NOT has_esp AND NOT has_sang;
    has_t := nm ~ '\m(tinto|tintos)\M';
    has_b := nm ~ '\m(branco|brancos)\M';
    has_r := nm ~ '\m(ros[eé])\M';

    -- Sangria-only kits
    IF has_sang AND NOT has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

    -- Espumante-only kits
    ELSIF has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

    -- Mixed wine + sparkling kits
    ELSIF has_esp AND (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['ve-brancos-roses'];
      ELSE                       cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['ve-zero-alcool']; END IF;

    -- Wine-only kits (default)
    ELSE
      cat_slugs := cat_slugs || ARRAY['so-vinhos'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['tintos','brancos','roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['brancos-roses'];
      ELSIF has_t           THEN cat_slugs := cat_slugs || ARRAY['tintos'];
      ELSIF has_b           THEN cat_slugs := cat_slugs || ARRAY['brancos'];
      ELSIF has_r           THEN cat_slugs := cat_slugs || ARRAY['roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['vinhos-zero-alcool']; END IF;
    END IF;
  END IF;

  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','tintos-brancos','tintos-roses','brancos-roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-brancos-roses','espumantes-zero-alcool',
       'vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses','ve-tintos-brancos-roses','ve-zero-alcool',
       'so-sangrias','sangrias'
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

-- Re-sync all kits with the new logic
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type='kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;
