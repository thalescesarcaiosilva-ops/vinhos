
-- Parent
INSERT INTO public.categories (slug, name, sort_order) VALUES ('combos','Combos', 5)
ON CONFLICT (slug) DO NOTHING;

-- Group categories (children of combos)
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos'), v.so
FROM (VALUES
  ('combos-so-vinhos','Só Vinhos',1),
  ('combos-so-espumantes','Só Espumantes',2),
  ('combos-vinhos-espumantes','Vinhos & Espumantes',3),
  ('combos-so-sangrias','Só Sangrias',4)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Vinhos sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-so-vinhos'), v.so
FROM (VALUES
  ('combos-vinhos-tintos','Tintos',1),
  ('combos-vinhos-brancos','Brancos',2),
  ('combos-vinhos-roses','Rosés',3),
  ('combos-vinhos-tintos-brancos','Tintos e Brancos',4),
  ('combos-vinhos-tintos-roses','Tintos e Rosés',5),
  ('combos-vinhos-brancos-roses','Brancos e Rosés',6),
  ('combos-vinhos-zero-alcool','Zero Álcool',7)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Espumantes sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-so-espumantes'), v.so
FROM (VALUES
  ('combos-espumantes-brancos','Brancos',1),
  ('combos-espumantes-roses','Rosés',2),
  ('combos-espumantes-brancos-roses','Brancos e Rosés',3),
  ('combos-espumantes-zero-alcool','Zero Álcool',4)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Vinhos & Espumantes sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-vinhos-espumantes'), v.so
FROM (VALUES
  ('combos-ve-tintos-brancos','Tintos e Brancos',1),
  ('combos-ve-tintos-roses','Tintos e Rosés',2),
  ('combos-ve-brancos-roses','Brancos e Rosés',3),
  ('combos-ve-tintos-brancos-roses','Tintos, Brancos e Rosés',4),
  ('combos-ve-zero-alcool','Zero Álcool',5)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Sangrias sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT 'combos-sangrias','Sangrias',(SELECT id FROM public.categories WHERE slug='combos-so-sangrias'),1
ON CONFLICT (slug) DO NOTHING;

-- Updated sync function: combos go ONLY to combos-* categories
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
    IF p.color = 'misto'  THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';
    has_t := nm ~ '\m(tinto|tintos)\M';
    has_b := nm ~ '\m(branco|brancos)\M';
    has_r := nm ~ '\m(ros[eé])\M';

    IF has_sang AND NOT has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-sangrias','combos-sangrias'];

    ELSIF has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-zero-alcool']; END IF;

    ELSIF has_esp AND (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-brancos-roses'];
      ELSE                       cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
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

  -- Limpa todas as categorias gerenciadas (vinhos, espumantes, sangrias E combos)
  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','tintos-brancos','tintos-roses','brancos-roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-brancos-roses','espumantes-zero-alcool',
       'vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses','ve-tintos-brancos-roses','ve-zero-alcool',
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

-- Re-sync all kits
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type='kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;
