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
