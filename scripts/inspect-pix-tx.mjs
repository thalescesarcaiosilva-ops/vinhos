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

const id = process.argv[2] || "133227861";
const sk = process.env.PAYOUTBR_SECRET_KEY;
const auth = `Basic ${Buffer.from(`${sk}:x`).toString("base64")}`;
const res = await fetch(`https://api.payoutbr.com.br/v1/transactions/${id}`, {
  headers: { authorization: auth, accept: "application/json" },
});
const tx = await res.json();
console.log("status", res.status);
console.log("pix keys:", tx.pix ? Object.keys(tx.pix) : "no pix");
console.log(JSON.stringify(tx.pix, null, 2));
