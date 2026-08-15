-- Produtos sugeridos (até 3 por produto)
CREATE TABLE public.product_suggestions (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  suggested_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 2),
  PRIMARY KEY (product_id, suggested_product_id),
  CONSTRAINT product_suggestions_no_self CHECK (product_id != suggested_product_id),
  UNIQUE (product_id, sort_order)
);

GRANT SELECT ON public.product_suggestions TO anon, authenticated;
GRANT ALL ON public.product_suggestions TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_suggestions TO authenticated;

ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product_suggestions"
ON public.product_suggestions FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins write product_suggestions"
ON public.product_suggestions FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_product_suggestions_product ON public.product_suggestions(product_id);

-- Desconto de 30% em todos os produtos ativos (preço de venda, sem preço riscado)
UPDATE public.products
SET
  price = ROUND(GREATEST(price, COALESCE(compare_at_price, price)) * 0.7, 2),
  compare_at_price = NULL
WHERE is_active = true;
