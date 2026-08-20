-- Corrige URLs de storage importadas de hosts legados.
-- Rode no SQL Editor: https://supabase.com/dashboard/project/aufvvgytbrstsrfomngm/sql/new
--
-- Substitui hosts antigos (Lovable / Supabase legado) por:
--   https://aufvvgytbrstsrfomngm.supabase.co/storage/...

DO $$
DECLARE
  new_host text := 'https://aufvvgytbrstsrfomngm.supabase.co';
  old_host text;
  old_hosts text[] := ARRAY[
    'https://dymhoqxfamosdujzorrl.supabase.co'
  ];
BEGIN
  FOREACH old_host IN ARRAY old_hosts LOOP
    UPDATE public.products
    SET image_url = replace(image_url, old_host, new_host)
    WHERE image_url LIKE old_host || '%';

    UPDATE public.products
    SET video_url = replace(video_url, old_host, new_host)
    WHERE video_url LIKE old_host || '%';

    UPDATE public.products
    SET gallery = replace(gallery::text, old_host, new_host)::jsonb
    WHERE gallery::text LIKE '%' || old_host || '%';

    UPDATE public.banners
    SET image_url = replace(image_url, old_host, new_host)
    WHERE image_url LIKE old_host || '%';

    UPDATE public.categories
    SET banner_image = replace(banner_image, old_host, new_host)
    WHERE banner_image LIKE old_host || '%';

    UPDATE public.profiles
    SET avatar_url = replace(avatar_url, old_host, new_host)
    WHERE avatar_url LIKE old_host || '%';

    UPDATE public.order_items
    SET product_image = replace(product_image, old_host, new_host)
    WHERE product_image LIKE old_host || '%';

    UPDATE public.reviews
    SET photos = (
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(elem) = 'string'
             THEN to_jsonb(replace(elem #>> '{}', old_host, new_host))
             ELSE elem END
      )
      FROM jsonb_array_elements(photos) elem
    )
    WHERE photos::text LIKE '%' || old_host || '%'
      AND jsonb_typeof(photos) = 'array';

    UPDATE public.store_settings
    SET data = replace(data::text, old_host, new_host)::jsonb
    WHERE data::text LIKE '%' || old_host || '%';
  END LOOP;
END $$;

-- Verificar se ainda restam URLs do host Lovable:
SELECT 'products.image_url' AS campo, count(*) AS qtd
FROM public.products WHERE image_url LIKE '%dymhoqxfamosdujzorrl%'
UNION ALL
SELECT 'products.gallery', count(*) FROM public.products
WHERE gallery::text LIKE '%dymhoqxfamosdujzorrl%'
UNION ALL
SELECT 'banners.image_url', count(*) FROM public.banners
WHERE image_url LIKE '%dymhoqxfamosdujzorrl%'
UNION ALL
SELECT 'categories.banner_image', count(*) FROM public.categories
WHERE banner_image LIKE '%dymhoqxfamosdujzorrl%'
UNION ALL
SELECT 'store_settings.data', count(*) FROM public.store_settings
WHERE data::text LIKE '%dymhoqxfamosdujzorrl%';

-- Assets do CDN Lovable (/__l5e/...) — listar para re-upload manual:
SELECT id, slug, image_url AS url FROM public.products WHERE image_url LIKE '/__l5e/%'
UNION ALL
SELECT id, slug, video_url FROM public.products WHERE video_url LIKE '/__l5e/%';
