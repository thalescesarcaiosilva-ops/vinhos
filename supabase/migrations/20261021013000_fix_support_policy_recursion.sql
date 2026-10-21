-- Quebra a recursão entre orders e support_order_contacts e guarda o comprovante da recuperação.

CREATE OR REPLACE FUNCTION public.order_is_visible_followup(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.support_marked_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_order_contacts c
    WHERE c.order_id = p_order_id
  );
$$;

REVOKE ALL ON FUNCTION public.order_is_visible_followup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_marked_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_is_visible_followup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.support_marked_order(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support inserts followup contact marks" ON public.support_order_contacts;
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
    AND public.order_is_visible_followup(order_id)
  );

DROP POLICY IF EXISTS "Support reads recovery marked orders" ON public.orders;
CREATE POLICY "Support reads recovery marked orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND public.support_marked_order(id)
  );

DROP POLICY IF EXISTS "Support reads items of recovery marked orders" ON public.order_items;
CREATE POLICY "Support reads items of recovery marked orders"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND public.support_marked_order(order_id)
  );

ALTER TABLE public.support_order_contacts
  ADD COLUMN IF NOT EXISTS recovery_receipt_path text,
  ADD COLUMN IF NOT EXISTS recovery_receipt_mime text;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]
WHERE id = 'pix-receipts';
