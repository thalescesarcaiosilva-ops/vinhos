-- >>> 20260711232200_dedupe_and_combo_discount.sql
-- Desativar duplicatas exatas e aplicar 15% em combos (executado via scripts/fix-duplicates-and-combos.mjs)
-- Registro apenas; alterações aplicadas em 2026-07-11.


-- >>> 20260713150000_search_products_unaccent.sql
-- Busca de produtos com suporte a acentos (unaccent)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

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


-- >>> 20260723143000_pix_receipt_comprovante.sql
-- Comprovante Pix: colunas no pedido + bucket privado
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pix_receipt_path text,
  ADD COLUMN IF NOT EXISTS pix_receipt_mime text,
  ADD COLUMN IF NOT EXISTS pix_receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pix_receipt_token text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_pix_receipt_token_uidx
  ON public.orders (pix_receipt_token)
  WHERE pix_receipt_token IS NOT NULL;

COMMENT ON COLUMN public.orders.pix_receipt_path IS 'Caminho do comprovante no bucket privado pix-receipts';
COMMENT ON COLUMN public.orders.pix_receipt_token IS 'Token de upload para convidado (checkout Pix)';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pix-receipts',
  'pix-receipts',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- Admin autenticado pode ler objetos do bucket (signed URL ainda é preferível via server).
DROP POLICY IF EXISTS "Admins read pix receipts" ON storage.objects;
CREATE POLICY "Admins read pix receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pix-receipts' AND public.has_role(auth.uid(), 'admin'::public.app_role));


-- >>> 20260727133858_order_items_read_by_email.sql
-- Cliente que vê o pedido pelo e-mail da conta também precisa ler os itens.
-- Antes: orders tinha "Users read orders by matching email", mas order_items
-- só liberava quando orders.user_id = auth.uid() → UI mostrava "0 item(s)".

DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Users read own order items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.user_id = (SELECT auth.uid())
          OR (
            o.customer_email IS NOT NULL
            AND lower(o.customer_email) = lower(COALESCE((SELECT auth.jwt() ->> 'email'), ''))
          )
        )
    )
  );

-- Histórico do pedido: mesma regra de ownership
DROP POLICY IF EXISTS "Users read own order history" ON public.order_status_history;
CREATE POLICY "Users read own order history"
  ON public.order_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND (
          o.user_id = (SELECT auth.uid())
          OR public.has_role((SELECT auth.uid()), 'admin')
          OR (
            o.customer_email IS NOT NULL
            AND lower(o.customer_email) = lower(COALESCE((SELECT auth.jwt() ->> 'email'), ''))
          )
        )
    )
  );

-- Vincular pedidos órfãos ao usuário cadastrado com o mesmo e-mail
UPDATE public.orders o
SET user_id = u.id
FROM auth.users u
WHERE o.user_id IS NULL
  AND o.customer_email IS NOT NULL
  AND u.email IS NOT NULL
  AND lower(trim(o.customer_email)) = lower(u.email);


-- >>> 20260727230229_link_guest_orders_on_auth.sql
-- Vincula pedidos feitos como convidado (user_id null) à conta quando
-- o cliente se cadastra ou chama a função após login, pelo mesmo e-mail.

CREATE OR REPLACE FUNCTION public.link_guest_orders_to_user(p_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Cliente autenticado só pode vincular a si mesmo
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT lower(trim(email)) INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.orders
  SET user_id = p_user_id
  WHERE user_id IS NULL
    AND customer_email IS NOT NULL
    AND lower(trim(customer_email)) = v_email;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.link_guest_orders_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_guest_orders_to_user(uuid) TO authenticated, service_role;

-- Ao criar conta, puxa pedidos guest com o mesmo e-mail
CREATE OR REPLACE FUNCTION public.on_auth_user_created_link_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.link_guest_orders_to_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_orders ON auth.users;
CREATE TRIGGER on_auth_user_created_link_orders
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_auth_user_created_link_orders();

-- Garante policy de leitura por e-mail (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.orders'::regclass
      AND polname = 'Users read orders by matching email'
  ) THEN
    CREATE POLICY "Users read orders by matching email"
      ON public.orders
      FOR SELECT
      TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND customer_email IS NOT NULL
        AND lower(customer_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      );
  END IF;
END $$;


