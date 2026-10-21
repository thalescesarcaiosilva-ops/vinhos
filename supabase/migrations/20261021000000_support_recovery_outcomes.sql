-- Situação da recuperação (aguardando / recuperado / perdido) e leitura
-- mesmo depois que o pedido sai da fila de não pagos.

ALTER TABLE public.support_order_contacts
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS recovered_total numeric;

ALTER TABLE public.support_order_contacts
  DROP CONSTRAINT IF EXISTS support_order_contacts_outcome_check;

ALTER TABLE public.support_order_contacts
  ADD CONSTRAINT support_order_contacts_outcome_check
  CHECK (outcome IN ('waiting', 'recovered', 'lost'));

UPDATE public.support_order_contacts
SET outcome_at = contacted_at
WHERE outcome = 'waiting';

DROP POLICY IF EXISTS "Support reads followup contact marks" ON public.support_order_contacts;
CREATE POLICY "Support reads followup contact marks"
  ON public.support_order_contacts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "Support updates followup contact marks" ON public.support_order_contacts;
CREATE POLICY "Support updates followup contact marks"
  ON public.support_order_contacts
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "Support deletes followup contact marks" ON public.support_order_contacts;
CREATE POLICY "Support deletes followup contact marks"
  ON public.support_order_contacts
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "Support reads recovery marked orders" ON public.orders;
CREATE POLICY "Support reads recovery marked orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.support_order_contacts c
      WHERE c.order_id = orders.id
    )
  );

DROP POLICY IF EXISTS "Support reads items of recovery marked orders" ON public.order_items;
CREATE POLICY "Support reads items of recovery marked orders"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.support_order_contacts c
      WHERE c.order_id = order_items.order_id
    )
  );
