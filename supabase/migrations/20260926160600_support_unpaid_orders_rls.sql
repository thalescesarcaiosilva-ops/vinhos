-- Pedidos visíveis ao suporte: gerados, ainda pendentes, sem pagamento, há mais de 15 minutos.
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
    p_status = 'pending'::public.order_status
    AND p_created_at <= (now() - interval '15 minutes')
    AND (
      p_payment_status IS NULL
      OR lower(btrim(p_payment_status)) IN ('pending', 'waiting', 'waiting_payment', 'processing')
    );
$$;

REVOKE ALL ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support reads abandoned unpaid orders" ON public.orders;
CREATE POLICY "Support reads abandoned unpaid orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND public.order_is_unpaid_followup(status, payment_status, created_at)
  );

DROP POLICY IF EXISTS "Support reads items of abandoned unpaid orders" ON public.order_items;
CREATE POLICY "Support reads items of abandoned unpaid orders"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE INDEX IF NOT EXISTS idx_orders_pending_created_at
  ON public.orders (created_at DESC)
  WHERE status = 'pending';
