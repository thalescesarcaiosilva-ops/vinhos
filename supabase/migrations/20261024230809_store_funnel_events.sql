-- Funil da loja: uma linha por etapa da visita, sem dados pessoais.

CREATE TABLE public.store_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  step text NOT NULL,
  order_id uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_funnel_events_step_check CHECK (
    step IN ('cart', 'checkout', 'personal', 'shipping', 'payment', 'order', 'paid')
  ),
  CONSTRAINT store_funnel_events_session_len CHECK (
    char_length(session_id) BETWEEN 16 AND 80
  )
);

CREATE INDEX store_funnel_events_created_at_idx
  ON public.store_funnel_events (created_at DESC);

CREATE UNIQUE INDEX store_funnel_events_visit_step_uidx
  ON public.store_funnel_events (session_id, step)
  WHERE order_id IS NULL;

CREATE UNIQUE INDEX store_funnel_events_order_step_uidx
  ON public.store_funnel_events (order_id, step)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.store_funnel_events ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.store_funnel_events TO anon, authenticated;
GRANT SELECT ON public.store_funnel_events TO authenticated;

CREATE POLICY "Public inserts funnel steps"
ON public.store_funnel_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  step IN ('cart', 'checkout', 'personal', 'shipping', 'payment', 'order', 'paid')
  AND char_length(session_id) BETWEEN 16 AND 80
);

CREATE POLICY "Admin reads funnel"
ON public.store_funnel_events
FOR SELECT
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
