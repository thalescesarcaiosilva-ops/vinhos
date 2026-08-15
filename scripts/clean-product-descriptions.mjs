/**
 * Limpa descrições importadas (HTML e \\n literais) no banco.
 * Uso: node scripts/clean-product-descriptions.mjs
 */
import { getSupabaseConfig } from "./lib/env.mjs";

const { url, jwt } = getSupabaseConfig();

function htmlToPlain(html) {
  if (!html) return "";
  let text = html
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function needsClean(v) {
  return v && (v.includes("\\n") || /<[a-z][\s\S]*>/i.test(v));
}

async function rest(path, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...opts,
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  let from = 0;
  let updated = 0;
  while (true) {
    const batch = await rest(
      `/rest/v1/products?select=id,short_description,description&or=(short_description.ilike.*\\n*,description.ilike.*\\n*,short_description.ilike.*<*,description.ilike.*<*)&offset=${from}&limit=200`,
    );
    if (!batch?.length) break;

    for (const p of batch) {
      const payload = {};
      if (needsClean(p.short_description)) payload.short_description = htmlToPlain(p.short_description);
      if (needsClean(p.description)) payload.description = htmlToPlain(p.description);
      if (!Object.keys(payload).length) continue;

      await rest(`/rest/v1/products?id=eq.${p.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: { Prefer: "return=minimal" },
      });
      updated++;
      if (updated % 50 === 0) console.log(`  ${updated} limpos...`);
    }

    if (batch.length < 200) break;
    from += 200;
  }
  console.log(`Concluído: ${updated} produtos atualizados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
