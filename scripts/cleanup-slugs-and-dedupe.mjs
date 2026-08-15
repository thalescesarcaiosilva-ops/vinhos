/**
 * 1) Remove sufixo -2 (ou -N) do slug quando o slug base está livre
 * 2) Desativa 4 grupos de duplicatas por nome
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const DEACTIVATE_SKUS = [
  "96094-5pjw3RJlWV32lQq", // Kit 8 Viña — mantém 98470
  "96089-5pjw3RJlWV32lQq", // Kit 8 Paseo — mantém 98466
  "97104-5pjw3RJlWV32lQq", // Ravanello — mantém 97246
  "VIN921", // Combo 3 tintos — mantém VIN839
];

async function rest(url, jwt, pathAndQuery, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${pathAndQuery}`, {
    ...opts,
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchAll(url, jwt) {
  const all = [];
  let from = 0;
  while (true) {
    const batch = await rest(
      url,
      jwt,
      `/rest/v1/products?select=id,sku,slug,name,is_active&offset=${from}&limit=1000`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const { url, jwt } = getSupabaseConfig();
const products = await fetchAll(url, jwt);
const slugSet = new Set(products.map((p) => p.slug));

const slugRenames = [];
for (const p of products) {
  const m = p.slug.match(/^(.+)-(\d+)$/);
  if (!m) continue;
  const base = m[1];
  if (slugSet.has(base)) continue;
  slugRenames.push({ id: p.id, sku: p.sku, from: p.slug, to: base });
  slugSet.add(base);
  slugSet.delete(p.slug);
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  slugRenames: slugRenames.length,
  slugRenameSamples: slugRenames.slice(0, 20),
  deactivatedSkus: DEACTIVATE_SKUS,
};

console.log(`Slugs a renomear: ${slugRenames.length}`);
console.log(`Duplicatas a desativar: ${DEACTIVATE_SKUS.length}`);

if (!DRY_RUN) {
  let renamed = 0;
  let slugErrors = 0;
  for (const r of slugRenames) {
    try {
      await rest(url, jwt, `/rest/v1/products?id=eq.${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ slug: r.to }),
        headers: { Prefer: "return=minimal" },
      });
      renamed++;
      if (renamed % 100 === 0) console.log(`  slugs: ${renamed}/${slugRenames.length}`);
    } catch (e) {
      slugErrors++;
      if (slugErrors <= 5) console.warn(`ERRO slug ${r.from}: ${e.message}`);
    }
  }

  let deactivated = 0;
  for (const sku of DEACTIVATE_SKUS) {
    const p = products.find((x) => x.sku === sku);
    if (!p) {
      console.warn(`SKU não encontrado: ${sku}`);
      continue;
    }
    await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
      headers: { Prefer: "return=minimal" },
    });
    deactivated++;
    console.log(`Desativado: ${p.name} (${sku})`);
  }

  // Segunda passada: renomear -3/-4 dos desativados se base livre
  const after = await fetchAll(url, jwt);
  const slugsAfter = new Set(after.map((p) => p.slug));
  let secondPass = 0;
  for (const p of after.filter((x) => x.is_active)) {
    const m = p.slug.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const base = m[1];
    if (slugsAfter.has(base)) continue;
    try {
      await rest(url, jwt, `/rest/v1/products?id=eq.${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ slug: base }),
        headers: { Prefer: "return=minimal" },
      });
      slugsAfter.add(base);
      slugsAfter.delete(p.slug);
      secondPass++;
    } catch { /* ignore */ }
  }

  report.result = { renamed, slugErrors, deactivated, secondPassRenames: secondPass };
  const final = await fetchAll(url, jwt);
  report.result.active = final.filter((p) => p.is_active).length;
  report.result.inactive = final.filter((p) => !p.is_active).length;
  report.result.slugsWithNumericSuffix = final.filter((p) => /-\d+$/.test(p.slug)).length;
  console.log(`\nRenomeados: ${renamed} (+${secondPass} 2ª passada)`);
  console.log(`Desativados: ${deactivated}`);
  console.log(`Ativos: ${report.result.active}`);
  console.log(`Slugs ainda com sufixo numérico: ${report.result.slugsWithNumericSuffix}`);
}

const outDir = path.join("scripts", "data", "backups");
mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
writeFileSync(path.join(outDir, `cleanup-slugs-dedupe-${ts}.json`), JSON.stringify(report, null, 2));
