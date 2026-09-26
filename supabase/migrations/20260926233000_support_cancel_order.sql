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
