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
