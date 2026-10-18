-- >>> 20260604165411_48d072d3-bead-46a9-9574-717bc2f7ec8b.sql
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT ALL ON public.order_items TO service_role;

GRANT ALL ON public.webhook_events TO service_role;


