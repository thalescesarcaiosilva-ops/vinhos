# Prompt — painel de suporte para pedidos não pagos e cancelados

Copie o texto abaixo a partir de “Quero um painel interno…” e cole na IA da outra loja. Troque só o que estiver entre colchetes.

---

Quero um painel interno só para o funcionário de suporte desta loja. Não é o painel geral do administrador. O suporte não edita produtos, preços, banners, clientes, cupons, configurações nem o pedido. Ele só vê uma lista para ligar ou mandar mensagem.

## Quem aparece na lista

Pedidos gerados há mais de 15 minutos que ainda não foram pagos. Também entram os pedidos cancelados, do mesmo jeito, depois desses 15 minutos.

Não entra pedido com menos de 15 minutos, mesmo que a pessoa ainda esteja pagando. Não entra pedido pago, confirmado, enviado, entregue ou reembolsado. Pedido cancelado continua na lista. Pedido pago sai sozinho, sem o suporte marcar nada.

Essa regra vale de verdade, também se alguém tentar ver outros pedidos pela conta de suporte. O suporte não consegue alterar nada.

## O que mostrar

Uma tabela, com busca por nome, telefone, e-mail e número do pedido. Filtros: últimas 24 horas (padrão), 7 dias, 30 dias e todos. Os mais recentes primeiro. A lista se atualiza sozinha a cada 30 segundos e tem um botão Atualizar.

Em cada pedido:

- número do pedido, data e hora, e há quanto tempo foi feito
- se está aguardando pagamento ou cancelado
- forma de pagamento
- aviso se o cliente já enviou comprovante e o pagamento ainda não foi confirmado
- nome, e-mail e telefone
- botão para ligar
- botão de WhatsApp com a mensagem já escrita, usando o primeiro nome, o nome da loja, o número do pedido e o valor. Se o pedido estiver cancelado, a mensagem diz que ele foi cancelado antes do pagamento. Se ainda estiver em aberto, diz que o pagamento não foi confirmado. Nos dois casos, oferece ajuda para concluir
- botão para copiar o telefone
- botão para copiar os dados do pedido
- endereço completo de entrega
- produtos, com quantidade, nome e valor
- total, e em texto menor o valor dos produtos, o desconto se houver, e o frete

Não mostre documento, código de pagamento, comprovante nem senha. Se não houver telefone, escreva “Sem telefone”.

## Acesso

O endereço do painel é /suporte. Só e-mail e senha. Sem criar conta, sem cadastro aberto e sem recuperar senha nessa tela.

Crie um acesso só de suporte, separado do administrador. Entregue o e-mail e a senha só na resposta, uma vez, e não grave a senha em nenhum arquivo. O e-mail é um login; não precisa ser uma caixa de correio de verdade. Use algo que não seja o e-mail de atendimento da loja, por exemplo [e-mail de login do suporte].

Quem tem só esse acesso vê a lista e nada mais. Se abrir o painel do administrador, avise e mande de volta para /suporte. O dono da loja também pode abrir /suporte. Cliente comum vê acesso negado.

A página não leva o menu, o rodapé nem o carrinho da loja. O visual segue o painel que a loja já tem. A tabela precisa funcionar no celular, com telefone, endereço e produtos visíveis.

## Fora do Google, igual ao admin

/suporte não pode ser encontrado no Google, do mesmo jeito que o painel do administrador:

- a página pede para os buscadores não indexarem
- o arquivo que orienta os robôs bloqueia /suporte em todos os grupos em que o admin já é bloqueado
- /suporte não entra no mapa do site
- nenhum link público aponta para lá: nem menu, nem rodapé, nem e-mail de pedido, nem feed de produtos
- essa página não carrega anúncio, Google Analytics, Tag Manager nem Clarity

## Pronto quando

- Pedido de menos de 15 minutos não aparece para o suporte.
- Pedido de mais de 15 minutos sem pagamento aparece, com nome, telefone, endereço, produtos e total.
- Pedido cancelado de mais de 15 minutos também aparece, marcado como cancelado.
- Pedido pago, enviado ou reembolsado não aparece.
- O suporte não altera pedido e não entra no resto do administrador.
- Cliente comum não vê a fila.
- O WhatsApp abre com a mensagem pronta e o telefone do Brasil com o código do país.
- /suporte fica fora do Google e fora do mapa do site, igual ao admin.
