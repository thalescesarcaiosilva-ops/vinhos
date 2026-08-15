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
