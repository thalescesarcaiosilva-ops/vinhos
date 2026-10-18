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


