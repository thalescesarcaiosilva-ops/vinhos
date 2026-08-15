-- Restrict contact_messages SELECT to admins only
DROP POLICY IF EXISTS "Only authenticated users/admins can view contact messages" ON public.contact_messages;
CREATE POLICY "Admins can view contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Remove overly permissive INSERT on orders (orders are created server-side via service role)
DROP POLICY IF EXISTS "Anyone can create order" ON public.orders;

-- Remove overly permissive INSERT on order_items (order_items are inserted server-side via service role)
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;