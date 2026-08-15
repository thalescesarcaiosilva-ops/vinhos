-- Remove desconto de todos os produtos: preço de venda = preço cheio (o maior).
-- Limpa compare_at_price para não exibir preço riscado na loja.
UPDATE public.products
SET
  price = CASE
    WHEN compare_at_price IS NOT NULL AND compare_at_price > price THEN compare_at_price
    ELSE price
  END,
  compare_at_price = NULL
WHERE compare_at_price IS NOT NULL;
