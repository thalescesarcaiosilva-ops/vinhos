-- Desconto de 30% no preço de venda, sem preço riscado (compare_at_price).
-- O valor cheio fica em compare_at_price temporariamente para o cálculo; depois é limpo.
UPDATE public.products
SET
  price = ROUND(GREATEST(price, COALESCE(compare_at_price, price)) * 0.7, 2),
  compare_at_price = NULL
WHERE is_active = true;
