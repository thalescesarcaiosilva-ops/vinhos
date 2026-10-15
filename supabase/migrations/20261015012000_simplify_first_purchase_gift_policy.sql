UPDATE public.store_settings
SET data = jsonb_set(
  data,
  '{footer,institutional}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN page->>'slug' = 'brinde-de-primeira-compra' THEN jsonb_set(
          page,
          '{content}',
          to_jsonb($policy$O jogo de taças é um produto da loja, com preço próprio. Ele pode ser comprado separado, como qualquer outro item.

O valor R$ 0,00 vale somente como brinde de primeira compra. Não é o preço de venda das taças e não reduz o valor dos outros produtos.

Quem tem direito
Tem direito o cliente novo da loja, que está fazendo a primeira compra e ainda não efetuou nenhum pedido antes.

Como funciona
O brinde entra automaticamente quando o pedido tem pelo menos um outro produto pago: 1 unidade das taças, a R$ 0,00, no carrinho e no checkout. Se as taças forem o único item, cobra-se o preço da página do produto.

Limites
Uma unidade grátis no primeiro pedido, enquanto houver estoque.

Dúvidas: atendimento@galvaovinhos.com.br · (31) 97554-9668
$policy$::text)
        )
        ELSE page
      END
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(COALESCE(data->'footer'->'institutional', '[]'::jsonb)) WITH ORDINALITY AS t(page, ordinality)
  )
)
WHERE id = 'singleton';
