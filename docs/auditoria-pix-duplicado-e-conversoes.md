# Auditoria: Pedidos Pix duplicados + conversões falsas no Google Ads

> **Como usar este documento**
> Este relatório descreve problemas reais encontrados e corrigidos na loja Galvao
> Vinhos (checkout Pix). Foi escrito para ser lido por uma IA (ou dev) auditando
> **outra loja**, para verificar se os mesmos problemas existem lá.
>
> Para cada item: (1) leia o sintoma, (2) procure os padrões indicados no código
> da outra loja, (3) confirme se o problema existe, (4) se existir, aplique a
> correção sugerida adaptada à stack daquele projeto.
>
> Contexto original que disparou esta investigação: clientes gerando o mesmo
> pedido Pix duas vezes, ambos ficando "Aguardando" pra sempre, mesmo
> cliente/e-mail/valor, poucos minutos de diferença entre os dois.

---

## Resumo executivo

| # | Problema | Impacto | Status neste projeto |
|---|---|---|---|
| 1 | Estado do Pix só em memória (React state), sem persistência | Pedido duplicado a cada reload/troca de app | ✅ Corrigido |
| 2 | Valor exibido recalculado do carrinho em vez de travado no pedido | Pode mostrar valor errado ao restaurar a tela | ✅ Corrigido |
| 3 | Tela não reage quando o gateway cancela/expira o Pix | Cliente vê "aguardando pagamento" pra sempre em uma cobrança morta | ✅ Corrigido |
| 4 | Sem checagem de duplicidade no servidor (idempotência) | Se o cliente mudar de dispositivo/navegador, ainda duplica | ⚠️ Não implementado — gap conhecido |
| 5 | Conversão do Google Ads disparada ao **gerar** o Pix, não ao confirmar pagamento | Conversões infladas/falsas distorcem métricas de anúncio | ⚠️ **Revertido** (por decisão de negócio) |
| 6 | (Bônus, fora do checkout) E-mails perdendo acentuação (`Olá` → `Ol�`) | E-mail transacional com aparência de spam/corrompido | ✅ Corrigido |
| 7 | Ao restaurar o Pix persistido (Problema 1), não havia tratamento para o carrinho ter mudado nesse meio-tempo | Cliente que quer comprar algo diferente ficava "preso" tendo que esperar o Pix antigo expirar | ✅ Corrigido |

---

## Problema 1 — Estado do Pix só em memória, sem persistência

**Sintoma observado:** cliente gera o Pix, sai da loja pra pagar (abre o app do
banco, troca de aba, o navegador recarrega em segundo plano no mobile) e, ao
voltar, encontra o **formulário de checkout vazio** em vez da tela do Pix — como
se nada tivesse sido gerado. Preenche tudo de novo e paga (ou tenta pagar) uma
segunda vez.

**Causa raiz:** o estado da tela de pagamento (`orderId`, QR code, código
copia-e-cola, data de expiração) vivia só em `useState` do componente React.
Qualquer coisa que remonte o componente — reload, navegador matando a aba em
segundo plano, F5 por impaciência — zera esse estado. O carrinho, por sua vez,
só é limpo quando o pagamento é **confirmado**, então ele continua intacto,
convidando a gerar um novo pedido para a mesma compra.

**Onde procurar na outra loja:**
- Tela/rota de checkout ou pagamento Pix
- Buscar `useState` guardando `qrCode`, `pixCode`, `orderId`, `paymentId` (ou
  equivalente) **sem** nenhuma leitura/escrita correspondente em
  `localStorage`/`sessionStorage`
- Confirmar se o carrinho é limpo antes ou depois da confirmação do pagamento
- Grep sugerido: `qrCode|pixCode|paymentId|orderId` cruzado com `useState` no
  arquivo do checkout; depois verificar se existe algum `localStorage.setItem`
  relacionado

**Como confirmar que existe:** gerar um Pix, dar F5 na página (ou forçar reload
via devtools mobile) e ver se a tela do QR desaparece e volta pro formulário.

**Correção recomendada:**
1. Ao gerar o pagamento com sucesso, salvar no `localStorage` um payload mínimo:
   `{ orderId, qrCode, expiresAt, total, ... }`.
2. No `mount` da tela de checkout, antes de decidir o que renderizar:
   - Ler o payload salvo.
   - **Revalidar no servidor** (endpoint de status do pagamento) antes de
     mostrar qualquer coisa — nunca confiar só no que está salvo localmente.
   - Se confirmado → mostrar tela de sucesso.
   - Se ainda pendente e não expirado → restaurar a tela do QR (sem criar
     pedido novo).
   - Se cancelado/expirado → limpar o storage e liberar o formulário normal.
3. Limpar o storage quando o pagamento for confirmado ou cancelado.

**Trade-off importante:** essa correção resolve o caso "mesmo navegador, mesmo
dispositivo". Se o cliente limpar dados do navegador ou usar outro
dispositivo/aba anônima, ainda pode duplicar — ver Problema 4.

---

## Problema 2 — Valor exibido recalculado do carrinho, não travado no pedido

**Sintoma observado (mais sutil, foi um bug latente descoberto ao implementar o
Problema 1):** a tela de pagamento mostrava o valor usando uma variável
derivada do carrinho **ao vivo** (subtotal + frete + descontos recalculados a
cada render), não o valor que efetivamente ficou gravado no pedido no momento
da criação.

**Por que isso é perigoso:** ao restaurar o estado depois de um reload (Problema
1), o carrinho/frete/cupom podem não ter recarregado ainda (ex.: frete ainda
não calculado = R$ 0 temporariamente) e a tela mostraria um valor **diferente**
do que o cliente realmente vai pagar — risco de "promessa falsa" de valor.

**Onde procurar:** na tela de pagamento/QR, o valor exibido (`R$ X,XX`) vem de
uma variável reativa ao carrinho, ou do retorno fixo da API que criou o
pagamento?

**Correção recomendada:** guardar o `total` junto com o restante do payload do
pagamento (mesmo objeto do Problema 1) no momento da criação, e usar **esse**
valor congelado em toda a tela de pagamento/confirmação — nunca recalcular.

---

## Problema 3 — Tela não reage a cancelamento/expiração do gateway

**Sintoma observado:** se o gateway de pagamento reporta que o Pix expirou ou
foi cancelado (via polling de status ou webhook), o código às vezes só
mostrava um toast/alerta e **parava o polling**, mas a tela continuava exibindo
o QR code e "Aguardando confirmação do pagamento..." — uma cobrança morta
sendo apresentada como se ainda pudesse ser paga.

**Onde procurar:** no polling/handler de status, localizar o branch que trata
`cancelled`/`expired`/`denied` e verificar se ele realmente **desmonta a tela
de QR** (ou só mostra uma mensagem que desaparece).

**Correção recomendada:** ao detectar status cancelado/expirado/recusado:
1. Limpar o estado local do pagamento (voltar pro formulário).
2. Limpar o storage persistido (Problema 1).
3. Mostrar mensagem clara orientando a gerar um novo pagamento.

---

## Problema 4 — Sem checagem de duplicidade no servidor (idempotência)

**Status: gap conhecido, não implementado neste ciclo** — incluído aqui para a
outra loja avaliar se vale a pena, dependendo do volume de casos.

**Sintoma:** o endpoint/servidor que cria o pedido + a cobrança no gateway
**nunca verifica** se já existe um pedido pendente recente com o mesmo
e-mail/carrinho/valor antes de criar um novo.

**Onde procurar:** na função server-side que recebe os dados do checkout e
chama a API do gateway de pagamento (criação da cobrança) — ver se há alguma
consulta prévia por pedidos `pending` recentes do mesmo cliente.

**Correção recomendada (se decidirem implementar):** antes de criar a
cobrança, consultar pedidos `pending` dos últimos N minutos com mesmo
e-mail + valor total; se existir e ainda não expirou no gateway, devolver a
cobrança existente em vez de criar uma nova (chave de idempotência aplicada à
regra de negócio, não só ao nível de API).

**Cuidado ao implementar:** não usar isso para tomar decisões automáticas sobre
pagamentos que o cliente alega ter feito mas o sistema não registrou — para
esse caso, o fluxo correto é comprovante manual (upload) + confirmação por um
humano, não heurística automática.

---

## Problema 5 — Conversão do Google Ads disparada ao gerar o Pix, não ao confirmar

**Sintoma observado:** o componente/evento de conversão do Google Ads
(`gtag('event', 'conversion', ...)` ou similar) disparava já na tela de "Pague
com Pix" (pagamento **pendente**, ainda não confirmado), usando o ID do pedido
como `transaction_id`.

**Por que isso é grave:** cada pedido gerado (pago ou não, duplicado ou não)
contava como uma "venda" pro Google Ads. Combinado com o Problema 1 (pedidos
duplicados), isso **infla artificialmente** as métricas de conversão e o
valor de receita reportado — o que faz o algoritmo de lances do Google Ads
otimizar com base em dados errados, gastando mais em anúncio por resultados que
não existiram.

**Onde procurar:**
- Grep por `gtag.*conversion|fbq\(.*Purchase|conversion.*event` na tela de
  pagamento Pix/cartão (pendente) vs. na tela de "pedido confirmado"/"obrigado"
- Confirmar em qual tela exatamente o evento de conversão dispara

**Como confirmar que existe:** gerar um Pix sem pagar e verificar (Tag
Assistant / Network tab filtrando `google-ads` ou `googleads.g.doubleclick.net`)
se a conversão já foi enviada mesmo sem o pagamento ter sido concluído.

**Correção aplicada:** o evento de conversão passou a disparar **somente** na
tela de pagamento confirmado (thank-you page), nunca na tela de Pix pendente.
Comentário adicionado no componente para deixar essa regra explícita:

```
/**
 * Dispara a conversão do Google Ads na página de obrigado (pagamento confirmado).
 * Gerar o Pix não é uma conversão — só a venda efetivada conta.
 */
```

> **⚠️ ATUALIZAÇÃO FINAL (22/09/2026):** A correção foi **totalmente revertida**
> por decisão de negócio. O comportamento voltou ao estado original: o pixel
> dispara **apenas ao gerar o Pix** (pedido criado), não na confirmação de
> pagamento. Isso significa que pedidos gerados mas não pagos contam como
> conversões nas métricas do Google Ads, refletindo a intenção de compra no
> topo do funil. Com a correção do Problema 1 (persistência do Pix), a
> duplicação de pedidos foi eliminada, então cada intenção de compra dispara
> apenas uma vez.

**Nota sobre deduplicação:** ao restaurar uma tela de confirmação para o mesmo
pedido (ex.: cliente recarrega a página de obrigado), o mesmo `transaction_id`
é reenviado — isso é seguro, pois o Google Ads deduplica automaticamente
conversões pelo mesmo `transaction_id`/order ID, mesmo entre sessões
diferentes. Não é necessário (e não recomendamos) suprimir o evento nesse caso
"por conta própria" com lógica frágil de sessão.

**Cuidado ao implementar em outra loja:** não usar isso como desculpa para
adicionar contadores regressivos falsos, selos de "últimas unidades" ou
qualquer elemento de urgência artificial na tela de pagamento — o objetivo é
reportar dados **verdadeiros** ao Google, não criar pressão psicológica extra
no cliente.

---

## Problema 6 (bônus, fora do fluxo de checkout) — E-mails perdendo acentuação

**Sintoma observado:** e-mail de confirmação de pedido chegando com caracteres
quebrados (`Olá` → `Ol�`, `João` → `Jo�o`).

**Causa raiz:** o HTML do e-mail declarava `charset=utf-8` no `<meta>`, mas o
provedor de envio (Resend, no nosso caso) não garantia o encoding correto em
todos os clientes de e-mail sem reforço explícito no conteúdo.

**Onde procurar:** template de e-mail transacional (pedido confirmado, boas-
vindas, etc.) — ver se caracteres acentuados aparecem direto no template sem
nenhum tratamento de encoding.

**Correção recomendada:** converter caracteres não-ASCII em entidades HTML
numéricas (`á` → `&#225;`) na função de escape do template, além de manter o
`<meta charset="utf-8">`. Reforça compatibilidade entre clientes de e-mail
diferentes.

---

## Problema 7 — Restaurar Pix persistido sem tratar mudança de carrinho ("Opção D")

> Este problema só existe **depois** de implementar a correção do Problema 1
> (persistência do Pix em `localStorage`). Se a outra loja ainda não tem essa
> persistência, implemente o Problema 1 primeiro e trate este junto.

**Sintoma observado:** depois de persistir o Pix pendente e restaurá-lo
automaticamente ao voltar na loja, surge uma nova pergunta: **e se o cliente
voltou querendo comprar outra coisa**, diferente do que gerou aquele Pix? Sem
tratamento, ele ficaria "preso" na tela do QR antigo até o pagamento expirar,
sem conseguir fazer um pedido novo com o carrinho atual — o que piora a
conversão para esse caso (raro, mas real).

**Requisito de negócio (decisão consciente, não bug):** a prioridade deve
continuar sendo o pedido já gerado — resumir automaticamente sempre que
possível — mas sem bloquear o cliente que genuinamente mudou de ideia.

**Solução aplicada — resumida em 3 partes:**

1. **Comparação de carrinho (silenciosa).** Ao salvar o Pix no `localStorage`
   (Problema 1), grava-se também uma assinatura simples do carrinho no momento
   da criação, por exemplo:
   ```
   function cartSignatureOf(items) {
     return items.map(i => `${i.id}:${i.quantity}`).sort().join("|");
   }
   ```
   Ao restaurar, essa assinatura é comparada com o carrinho atual:
   - **Igual** (ou Pix salvo em formato antigo, sem assinatura ainda) →
     resume automático, direto na tela do Pix, sem perguntar nada. Esse é o
     caminho feliz e deve ser silencioso — não incomodar quem só saiu para
     pagar e voltou.
   - **Diferente** → mostra uma tela de decisão intermediária (item 2).

2. **Tela de decisão (só quando o carrinho mudou).** Mensagem curta com o
   número do pedido pendente e o valor, e duas opções claras:
   - Botão primário (visualmente prioritário): **"Continuar pagamento
     pendente"** → volta pra tela do Pix existente.
   - Botão secundário: **"Fazer pedido com o carrinho atual"** → abandona o
     Pix antigo (ver item 3) e libera o formulário normal.

3. **"Abandonar" é só uma ação local + anotação — nunca cancelamento.**
   Ao clicar em "fazer pedido com o carrinho atual" (ou no link de escape do
   item 4), o app:
   - Limpa o `localStorage` local (Problema 1) e libera a tela.
   - Best-effort, chama o servidor para **anotar** o pedido antigo (ex.: campo
     `notes` com um marcador como `cliente_optou_novo_pedido`) — só para o
     time de atendimento entender o histórico depois.
   - **Nunca** cancela a cobrança no gateway nem muda o `status` do pedido
     antigo para `cancelled`. Se o cliente, por qualquer motivo, ainda pagar
     aquele Pix "abandonado", o webhook/polling de confirmação deve continuar
     funcionando normalmente e confirmar o pedido — evita perder uma venda por
     uma decisão de UI.

4. **Link de escape discreto na própria tela do Pix.** Mesmo quando o resumo é
   automático (carrinho igual), adicionar um link de baixa ênfase do tipo
   *"Prefiro fazer um pedido diferente"* embaixo da tela do Pix, com uma
   confirmação (`window.confirm` ou modal) explicando que o Pix antigo
   continua válido até expirar — é só uma via de escape, não um cancelamento.

**Onde procurar/replicar na outra loja:**
- No mesmo lugar onde o Problema 1 foi corrigido (persistência do Pix),
  verificar se existe qualquer comparação entre o carrinho salvo e o atual ao
  restaurar.
- Se não existir, ou se a restauração automática sempre reexibe o Pix antigo
  sem nenhuma saída visível para o cliente, aplicar as 4 partes acima.

**Como confirmar que existe o problema:** gerar um Pix, sem pagar, voltar pra
loja, adicionar/remover um item diferente do carrinho, e tentar fechar o
pedido — se a única opção visível for esperar o Pix antigo expirar, o problema
existe.

---

## Checklist rápido para rodar na outra loja

- [ ] O estado do pagamento pendente é persistido em `localStorage`/
      `sessionStorage`, ou some ao recarregar a página?
- [ ] O valor mostrado na tela de pagamento vem de um campo travado no pedido,
      ou é recalculado do carrinho a cada render?
- [ ] Quando o gateway cancela/expira o pagamento, a tela reflete isso (some o
      QR) ou fica presa em "aguardando"?
- [ ] Existe alguma checagem de pedido duplicado/pendente antes de criar um
      novo no servidor?
- [ ] A conversão do Google Ads (ou Facebook Pixel, TikTok Pixel etc.) dispara
      na geração do pagamento ou só na confirmação?
- [ ] Templates de e-mail transacional preservam acentuação em todos os
      clientes de e-mail?
- [ ] Se o Pix pendente é restaurado automaticamente (Problema 1), existe
      alguma saída para o cliente que voltou querendo comprar algo diferente
      do carrinho original, ou ele fica preso até o Pix antigo expirar?
