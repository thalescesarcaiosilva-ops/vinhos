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
