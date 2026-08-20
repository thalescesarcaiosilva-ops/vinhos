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

async function req(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: auth,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  console.log(`\n${init?.method || "GET"} ${path} -> ${res.status}`);
  console.log(text.slice(0, 500));
  return { res, text };
}

// card token tests
for (const body of [
  { number: "4000000000000010", holderName: "TESTE SILVA", expirationMonth: 12, expirationYear: 2028, cvv: "123" },
  { card: { number: "4000000000000010", holderName: "TESTE SILVA", expirationMonth: 12, expirationYear: 2028, cvv: "123" } },
]) {
  const pkUrl = `${base}/card-token?publicKey=${encodeURIComponent(pk)}`;
  const tokenRes = await fetch(pkUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/plain" },
    body: JSON.stringify(body),
  });
  console.log(`\nPOST card-token ${JSON.stringify(body).slice(0, 60)} -> ${tokenRes.status}`);
  console.log((await tokenRes.text()).slice(0, 300));
}

// minimal pix transaction
await req("/transactions", {
  method: "POST",
  body: JSON.stringify({
    amount: 1000,
    paymentMethod: "pix",
    customer: {
      name: "Teste Galvao",
      email: "teste@galvaovinhos.com.br",
      phone: "62999999999",
      document: { type: "cpf", number: "12345678909" },
      address: {
        street: "Rua Teste",
        streetNumber: "100",
        neighborhood: "Centro",
        city: "Goiania",
        state: "GO",
        zipCode: "74000000",
        country: "BR",
      },
    },
    shipping: {
      fee: 0,
      address: {
        street: "Rua Teste",
        streetNumber: "100",
        neighborhood: "Centro",
        city: "Goiania",
        state: "GO",
        zipCode: "74000000",
        country: "BR",
      },
    },
    items: [{ title: "Vinho Teste", unitPrice: 1000, quantity: 1, tangible: true }],
    postbackUrl: "https://www.galvaovinhos.com.br/api/public/payoutbr-webhook",
    metadata: "test-order",
    externalRef: "test-order",
    traceable: true,
    pix: { expiresInDays: 1 },
  }),
});
