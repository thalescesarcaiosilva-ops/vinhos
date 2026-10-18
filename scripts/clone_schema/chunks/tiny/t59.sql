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


