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
