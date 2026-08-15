// Diagnóstico do fluxo de pagamento por cartão na PayoutBR.
// Uso: node scripts/test-payoutbr-card.mjs
// Passos: tokeniza um cartão (validade em INTEIROS) e cria uma transação
// credit_card usando card.hash — reproduzindo exatamente o fluxo do checkout.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m || line.trimStart().startsWith("#")) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const sk = process.env.PAYOUTBR_SECRET_KEY;
const pk = process.env.PAYOUTBR_PUBLIC_KEY;
const auth = `Basic ${Buffer.from(`${sk}:x`).toString("base64")}`;
const base = "https://api.payoutbr.com.br/v1";
const pkUrl = `${base}/card-token?publicKey=${encodeURIComponent(pk)}`;

// Mesma lógica de parsing corrigida do PayoutCardForm.tsx.
function parseCardToken(text) {
  const trimmed = text.trim();
  try {
    const json = JSON.parse(trimmed);
    if (typeof json === "string") return json.trim();
    const value = json?.token ?? json?.hash ?? json?.card_hash ?? json?.data;
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* não era JSON */
  }
  return trimmed.replace(/^"|"$/g, "");
}

async function tokenize(card) {
  const res = await fetch(pkUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/plain" },
    body: JSON.stringify(card),
  });
  const text = await res.text();
  return { status: res.status, token: parseCardToken(text), raw: text };
}

const customer = {
  name: "Teste Vinelle",
  email: "teste@vinelle.com.br",
  phone: "62999999999",
  document: { type: "cpf", number: "11144477735" },
  address: {
    street: "Rua Teste",
    streetNumber: "100",
    neighborhood: "Centro",
    city: "Goiania",
    state: "GO",
    zipCode: "74000000",
    country: "BR",
  },
};

async function createTransaction(token) {
  const res = await fetch(`${base}/transactions`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: auth },
    body: JSON.stringify({
      amount: 1000,
      paymentMethod: "credit_card",
      installments: 1,
      card: { hash: token },
      customer,
      shipping: { fee: 0, address: customer.address },
      items: [{ title: "Vinho Teste", unitPrice: 1000, quantity: 1, tangible: true }],
      postbackUrl: "https://vinellevinhos.vercel.app/api/public/payoutbr-webhook",
      metadata: "test-card-order",
      externalRef: "test-card-order",
      traceable: true,
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* noop */
  }
  return { httpStatus: res.status, status: json?.status ?? null, refusedReason: json?.refusedReason ?? null, raw: text };
}

const tok = await tokenize({
  number: "4000000000000010",
  holderName: "TESTE SILVA",
  expirationMonth: 12, // INTEIRO — enviar string aqui causa 422
  expirationYear: 2030, // INTEIRO
  cvv: "123",
});
console.log("card-token ->", tok.status, "| token limpo:", JSON.stringify(tok.token.slice(0, 12)) + "...");

const tx = await createTransaction(tok.token);
console.log("transaction -> http", tx.httpStatus, "| status:", tx.status, "| refusedReason:", tx.refusedReason);
