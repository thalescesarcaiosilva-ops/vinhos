-- Limpa catálogo e dados transacionais para reimportação limpa.
-- Mantém: categories, store_settings, users/roles, taxonomia (brands/grapes/regions/collections).
-- Projeto: aufvvgytbrstsrfomngm (Galvao Vinhos)

BEGIN;

-- Cupons / pedidos
DELETE FROM public.coupon_redemptions;
DELETE FROM public.order_status_history;
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.webhook_events;

-- Catálogo e engajamento
DELETE FROM public.reviews;
DELETE FROM public.favorites;
DELETE FROM public.product_grapes;
DELETE FROM public.product_categories;
DELETE FROM public.products;

-- Banners com paths fictícios (/src/assets/...)
DELETE FROM public.banners;

-- Mensagens de teste
DELETE FROM public.contact_messages;

-- Cupons de exemplo (opcional — descomente se quiser manter)
DELETE FROM public.coupons;

COMMIT;

-- Conferência pós-limpeza
SELECT 'products' AS t, count(*)::int AS n FROM public.products
UNION ALL SELECT 'banners', count(*)::int FROM public.banners
UNION ALL SELECT 'categories', count(*)::int FROM public.categories
UNION ALL SELECT 'store_settings', count(*)::int FROM public.store_settings;
