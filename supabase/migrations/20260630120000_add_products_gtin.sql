ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gtin text;

COMMENT ON COLUMN public.products.gtin IS 'GTIN/EAN-13 para Google Merchant e identificação do produto';

CREATE INDEX IF NOT EXISTS idx_products_gtin ON public.products (gtin)
  WHERE gtin IS NOT NULL;
