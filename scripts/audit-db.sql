-- Auditoria rápida do banco Galvao Vinhos (aufvvgytbrstsrfomngm)
SELECT 'products' AS t, count(*)::int AS n FROM public.products
UNION ALL SELECT 'categories', count(*)::int FROM public.categories
UNION ALL SELECT 'banners', count(*)::int FROM public.banners
UNION ALL SELECT 'orders', count(*)::int FROM public.orders
UNION ALL SELECT 'product_categories', count(*)::int FROM public.product_categories
UNION ALL SELECT 'reviews', count(*)::int FROM public.reviews
UNION ALL SELECT 'favorites', count(*)::int FROM public.favorites
UNION ALL SELECT 'coupons', count(*)::int FROM public.coupons;

SELECT 'broken_l5e_products' AS issue, count(*)::int AS n
FROM public.products WHERE image_url LIKE '/__l5e/%' OR video_url LIKE '/__l5e/%'
   OR gallery::text LIKE '%/__l5e/%'
UNION ALL
SELECT 'legacy_host_products', count(*)::int
FROM public.products
WHERE image_url LIKE '%dymhoqxfamosdujzorrl%'
   OR image_url LIKE '%vinellevinhos.com.br/storage%'
   OR image_url LIKE '%zsfhnjrotkbzyikkxmnm%'
UNION ALL
SELECT 'categories_no_banner', count(*)::int
FROM public.categories WHERE banner_image IS NULL OR banner_image = ''
UNION ALL
SELECT 'products_no_image', count(*)::int
FROM public.products WHERE image_url IS NULL OR image_url = '';
