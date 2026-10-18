-- >>> 20260926220000_support_followup_includes_cancelled.sql
-- Fila do suporte: pedido com mais de 15 minutos, ainda sem pagamento ou cancelado.
CREATE OR REPLACE FUNCTION public.order_is_unpaid_followup(
  p_status public.order_status,
  p_payment_status text,
  p_created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_created_at <= (now() - interval '15 minutes')
    AND p_status IN ('pending'::public.order_status, 'cancelled'::public.order_status)
    AND (
      p_payment_status IS NULL
      OR lower(btrim(p_payment_status)) NOT IN ('confirmed', 'paid', 'approved')
    );
$$;

CREATE INDEX IF NOT EXISTS idx_orders_cancelled_created_at
  ON public.orders (created_at DESC)
  WHERE status = 'cancelled';


-- >>> 20260926230000_support_order_contacts.sql
-- Marca de “já enviei mensagem” na fila de suporte. Não libera alteração do pedido.
CREATE TABLE public.support_order_contacts (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contacted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_order_contacts TO authenticated;
GRANT ALL ON public.support_order_contacts TO service_role;

ALTER TABLE public.support_order_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support reads followup contact marks"
  ON public.support_order_contacts
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support inserts followup contact marks"
  ON public.support_order_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support updates followup contact marks"
  ON public.support_order_contacts
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE POLICY "Support deletes followup contact marks"
  ON public.support_order_contacts
  FOR DELETE
  TO authenticated
  USING (
    (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = support_order_contacts.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );



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


