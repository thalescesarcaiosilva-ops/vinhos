/**
 * Atualiza textos de devolução e privacidade no store_settings (GMC / LGPD).
 * node scripts/update-policies-gmc.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./lib/env.mjs";

const RETURNS_INSERT = `1.1 Cenários comuns

Pedido que não chegou ou foi extraviado
Se o prazo estimado de entrega tiver sido ultrapassado sem movimentação no rastreio, ou se a transportadora confirmar extravio, contacte atendimento@galvaovinhos.com.br com o número do pedido. Analisaremos reenvio ou reembolso integral, conforme a situação e a Política de frete.

Produto errado
Se você receber item diferente do pedido (marca, rótulo, safra ou quantidade distintos do comprado), avise-nos em até 7 dias corridos do recebimento com fotos do produto e da embalagem. Confirmado erro nosso, providenciaremos troca, reenvio ou reembolso sem custo de retorno para você.

Produto danificado
Consulte a seção 3 desta Política.

Frete de devolução
Em arrependimento (Art. 49 do CDC), o frete de devolução é de responsabilidade do cliente: após autorização do atendimento, o comprador deve postar ou enviar o produto conforme orientação recebida, arcando com o custo do retorno. Em caso de defeito, avaria no transporte, extravio ou erro nosso, a Galvao Vinhos arca com o frete de devolução (retorno gratuito).

`;

const PRIVACY_LGPD_BLOCK = `Encarregado pelo tratamento de dados (LGPD)
Para assuntos relacionados à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), incluindo exercício de direitos do titular, utilize:
E-mail: atendimento@galvaovinhos.com.br
Telefone: (71) 99937-4325

`;

async function main() {
  const { url, jwt } = getSupabaseConfig();
  const sb = createClient(url, jwt, { auth: { persistSession: false } });

  const { data: row, error } = await sb.from("store_settings").select("data").eq("id", "singleton").single();
  if (error) throw error;

  const data = structuredClone(row.data);
  const pages = data.footer?.institutional;
  if (!Array.isArray(pages)) throw new Error("institutional ausente");

  let changed = 0;
  for (const page of pages) {
    if (page.slug === "politica-de-devolucao-e-reembolso") {
      if (!page.content.includes("1.1 Cenários comuns")) {
        page.content = page.content.replace(
          "O pedido de devolução deve ser enviado dentro desse prazo para atendimento@galvaovinhos.com.br.\n\n2. Condições",
          `O pedido de devolução deve ser enviado dentro desse prazo para atendimento@galvaovinhos.com.br.\n\n${RETURNS_INSERT}2. Condições`,
        );
        changed++;
        console.log("Devolução: cenários comuns adicionados");
      } else if (
        page.content.includes("o custeio do retorno segue a orientação do atendimento") ||
        page.content.includes("as regras de custeio do retorno observarão o CDC")
      ) {
        page.content = page.content
          .replace(
            /Frete de devolução\nEm arrependimento \(Art\. 49 do CDC\), o custeio do retorno segue a orientação do atendimento e a legislação aplicável\. Em caso de defeito, avaria no transporte, extravio ou erro nosso, o cliente não arca com o frete de devolução \(retorno gratuito\)\./,
            RETURNS_INSERT.trim().split("\n\n").pop() ?? "",
          )
          .replace(
            "Em caso de arrependimento, as regras de custeio do retorno observarão o CDC e a orientação enviada no atendimento. Em caso de defeito, avaria de transporte ou erro nosso, o cliente não deve arcar com o custo do retorno.",
            "Em caso de arrependimento (Art. 49 do CDC), o frete de devolução é de responsabilidade do cliente, conforme orientação enviada no atendimento. Em caso de defeito, avaria de transporte ou erro nosso, o cliente não arca com o custo do retorno.",
          );
        changed++;
        console.log("Devolução: frete de arrependimento atualizado (cliente paga)");
      }
    }
    if (page.slug === "politica-de-privacidade") {
      if (!page.content.includes("Encarregado pelo tratamento de dados (LGPD)")) {
        page.content = page.content.replace(
          "Esta Política explica como a Galvao Vinhos trata dados pessoais",
          `${PRIVACY_LGPD_BLOCK}Esta Política explica como a Galvao Vinhos trata dados pessoais`,
        );
        changed++;
        console.log("Privacidade: bloco LGPD / encarregado adicionado");
      }
    }
  }

  if (changed === 0) {
    console.log("Nada a atualizar (já aplicado).");
    return;
  }

  const { error: updErr } = await sb
    .from("store_settings")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", "singleton");
  if (updErr) throw updErr;
  console.log(`store_settings atualizado (${changed} página(s)).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
