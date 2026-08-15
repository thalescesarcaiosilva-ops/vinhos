
-- 1) store_settings: single-row key/value JSONB storage
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
CREATE POLICY "Public read store settings"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins write store settings" ON public.store_settings;
CREATE POLICY "Admins write store settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed defaults
INSERT INTO public.store_settings (id, data) VALUES (
  'singleton',
  jsonb_build_object(
    'shipping', jsonb_build_object(
      'freeShippingFrom', 300,
      'flatShipping', 29.9,
      'expressShipping', 49.9
    ),
    'payments', jsonb_build_object(
      'pixEnabled', true,
      'pixDiscount', 5,
      'boletoEnabled', true,
      'cardEnabled', true,
      'maxInstallments', 6,
      'minInstallment', 30,
      'interestFreeUpTo', 6,
      'monthlyInterest', 0
    ),
    'colors', jsonb_build_object(
      'primary', '#5a1a1f',
      'accent', '#c9a86a',
      'buy', '#2f9e4f'
    )
  )
) ON CONFLICT (id) DO NOTHING;

-- 2) categories: add banner_url
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS banner_url text;
