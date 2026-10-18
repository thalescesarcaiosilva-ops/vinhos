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