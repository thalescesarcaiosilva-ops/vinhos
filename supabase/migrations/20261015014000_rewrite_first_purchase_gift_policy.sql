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

Sobre o brinde
Na primeira compra na Galvao Vinhos, o Jogo de 2 Taças de Cristal Classic Galvão Vinhos entra no pedido como brinde, no valor de R$ 0,00.

Quem tem direito
Clientes novos da loja, que estão fazendo a primeira compra e ainda não efetuaram nenhum pedido. Quem já concluiu uma compra com a conta logada não recebe o brinde novamente.

Condições
- Válido apenas na primeira compra.
- O pedido precisa ter pelo menos um outro produto pago, além do Jogo de 2 Taças.
- Limite de 1 Jogo de 2 Taças como brinde por pedido.
- Sujeito à disponibilidade em estoque.

Como o brinde aparece no pedido
Quando as condições são atendidas, o Jogo de 2 Taças de Cristal Classic Galvão Vinhos é adicionado automaticamente ao carrinho e aparece no checkout como brinde, no valor de R$ 0,00. Não é necessário usar cupom.

Preço do Jogo de 2 Taças
O Jogo de 2 Taças de Cristal Classic Galvão Vinhos também é vendido separadamente, pelo preço informado na página do produto. Esse é o preço de venda do item.
O valor de R$ 0,00 se aplica somente quando o Jogo de 2 Taças entra no pedido como brinde de primeira compra.
Se o Jogo de 2 Taças for o único item do carrinho, ou for adicionado pelo cliente como compra, ele é cobrado pelo preço de venda e o brinde não é adicionado em duplicidade.

Preço dos demais produtos
Os demais produtos do pedido são cobrados pelo preço exibido na loja. O brinde não gera desconto sobre eles.

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
