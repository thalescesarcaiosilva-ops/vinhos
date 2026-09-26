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
