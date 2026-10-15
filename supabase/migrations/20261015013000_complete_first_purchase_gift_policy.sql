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
          to_jsonb($policy$O brinde é válido apenas na primeira compra.

O que é esta oferta
O Jogo de 2 Taças de Cristal Classic Galvão Vinhos é um produto à venda na loja, com preço próprio na página do produto. Esse preço é o valor real do item. Ele pode ser comprado separado, como qualquer outro produto.

Na primeira compra, a loja pode incluir 1 unidade dessas taças no pedido como brinde, sem custo.

O valor
O preço de venda das taças é o valor exibido na página do produto. Esse é o valor cobrado quando o cliente compra o jogo de taças avulso.

O R$ 0,00 vale somente quando as taças entram como brinde de primeira compra. Não é o preço de venda do produto. Não reduz o valor dos vinhos nem de qualquer outro item do pedido.

Quem tem direito
Tem direito o cliente novo da loja: quem está fazendo a primeira compra e ainda não efetuou nenhum pedido antes.

Quem já concluiu uma compra na loja, com a conta logada, não recebe o brinde novamente.

Condições
- O brinde é válido apenas na primeira compra.
- O pedido precisa ter pelo menos um outro produto pago. Se o carrinho tiver só as taças, cobra-se o preço da página do produto.
- Entra 1 unidade, a R$ 0,00, no carrinho e no checkout, enquanto houver estoque.
- Se o cliente já incluir as taças no carrinho pelo preço de venda, o brinde automático não é somado de novo.
- O brinde não altera o preço dos demais produtos.

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
