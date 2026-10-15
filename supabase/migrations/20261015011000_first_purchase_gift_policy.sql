UPDATE public.store_settings
SET data = jsonb_set(
  data,
  '{footer,institutional}',
  COALESCE(data->'footer'->'institutional', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'id', 'p-brinde-primeira-compra',
      'label', 'Brinde de primeira compra',
      'slug', 'brinde-de-primeira-compra',
      'content', $policy$
O jogo de taças anunciado como brinde é um produto à venda na loja, com preço próprio na página do produto. Esse preço é o valor real do item. Ele pode ser comprado separado, como qualquer outro produto.

O valor R$ 0,00 aparece somente como brinde de primeira compra. Ele não é o preço de venda do produto e não é um desconto no vinho ou em outro item do pedido.

Quando o brinde entra no pedido
- O carrinho precisa ter pelo menos um outro produto pago.
- Entra 1 unidade do jogo de taças, com valor R$ 0,00 no carrinho e no checkout.
- O preço dos demais produtos permanece o mesmo da página.

Quem tem direito
- Vale apenas na primeira compra.
- Quem compra sem login é tratado como primeira compra.
- Quem está logado e já tem pedido pago ou confirmado nesta conta não recebe o brinde de novo.
- Se o jogo de taças for o único item do carrinho, ele é cobrado pelo preço da página do produto.

Limites
- 1 unidade grátis por pedido, enquanto houver estoque.
- A loja pode encerrar a oferta alterando esta página.
- O brinde não entra no anúncio do Google como produto grátis. No catálogo, o item segue com o preço de venda.

Dúvidas: atendimento@galvaovinhos.com.br · (31) 97554-9668
$policy$
    )
  )
)
WHERE id = 'singleton'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(data->'footer'->'institutional', '[]'::jsonb)) AS page
    WHERE page->>'slug' = 'brinde-de-primeira-compra'
  );
