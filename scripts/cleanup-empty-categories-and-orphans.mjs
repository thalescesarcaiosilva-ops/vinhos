/**
 * 1) Enquadra órfãos ativos em categorias existentes (color/type derivados do nome/uva/wine_type/descrição).
 * 2) Ativa categorias com produtos que estavam inativas.
 * 3) Remove do banco categorias sem nenhum produto ativo (tipo/combo) ou países sem estoque.
 *
 * Uso: node scripts/cleanup-empty-categories-and-orphans.mjs [--dry-run]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig } from "./lib/env.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const TINTO_RE =
  /\b(tinto|tintos|barbera|marselan|cabernet|merlot|malbec|shiraz|syrah|carmen[eè]re|carmenere|sangiovese|pinot noir|primitivo|tempranillo|tannat|bonarda|nebbiolo|zinfandel|petit verdot)\b/i;
const BRANCO_RE =
  /\b(branco|brancos|blanc|chardonnay|sauvignon blanc|viognier|moscatel|moscato(?!\s*ros[eé])|chenin|semillon|riesling|pinot gri|albari[ñn]o|alvarinho|verdejo|gew[uü]rz)\b/i;
const ROSE_RE = /\b(ros[eé]|rosado|rosato)\b/i;

function inferFromProduct(p) {
  const name = p.name || "";
  const grape = p.grape || "";
  const wt = p.wine_type || "";
  const desc = p.short_description || "";
  const blob = `${name} ${grape} ${wt} ${desc}`;

  const patch = {};

  if (/\bcava\b/i.test(name) && p.product_type === "vinho") {
    patch.product_type = "espumante";
  }

  if (p.color === "na" || !p.color) {
    if (/^ros[eé]$/i.test(grape.trim()) || (ROSE_RE.test(grape) && !/blanc|branco/i.test(grape))) {
      patch.color = "rose";
    } else if (ROSE_RE.test(name) && !/blanc|branco/i.test(name)) {
      patch.color = "rose";
    } else if (
      /vinho tinto/i.test(wt) ||
      TINTO_RE.test(name) ||
      TINTO_RE.test(grape) ||
      TINTO_RE.test(desc) ||
      /vermelho-?rubi|rubi intenso|tinto expressivo|violácea intensa/i.test(desc)
    ) {
      patch.color = "tinto";
    } else if (
      /vinho branco/i.test(wt) ||
      BRANCO_RE.test(name) ||
      BRANCO_RE.test(grape) ||
      BRANCO_RE.test(desc) ||
      /amarelo esverdeado|cor dourada|moscatel blanc|sauvignon blanc/i.test(blob)
    ) {
      patch.color = "branco";
    } else if (ROSE_RE.test(blob)) {
      patch.color = "rose";
    }

    if (
      !patch.color &&
      (patch.product_type === "espumante" || p.product_type === "espumante") &&
      /\bcava\b/i.test(name)
    ) {
      patch.color = "branco";
    }
  }

  // País só se o próprio texto do produto citar origem de forma explícita
  if (!p.country) {
    if (/\bnorte da Espanha\b|\bem Espanha\b|\bEspanha,\b/i.test(desc) || (/\bEspanha\b/i.test(desc) && /\bcava\b/i.test(name))) {
      patch.country = "Espanha";
    } else if (/\bValle de Uco\b|\bMendoza\b|\bda Argentina\b|\bna Argentina\b/i.test(desc)) {
      patch.country = "Argentina";
    } else if (/\bdo Chile\b|\bno Chile\b|\bvinhedos do outro lado da Cordilheira dos Andes\b/i.test(desc) || (/\bChile\b/i.test(desc) && /Valduga Origem|Errazuriz|Morand/i.test(name))) {
      patch.country = "Chile";
    } else if (/\bChianti\b|\bToscana\b|\bda Itália\b|\bna Itália\b/i.test(desc)) {
      patch.country = "Itália";
    } else if (/\bÁfrica do Sul\b|\bAfrica do Sul\b/i.test(desc)) {
      patch.country = "África do Sul";
    } else if (/\bSerra Gaúcha\b|\bVale dos Vinhedos\b/i.test(desc)) {
      patch.country = "Brasil";
    }
  }

  return patch;
}

async function rest(url, jwt, pathAndQuery, opts = {}) {
  const res = await fetch(`${url.replace(/\/$/, "")}${pathAndQuery}`, {
    ...opts,
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: opts.headers?.Prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchPaged(url, jwt, basePath) {
  const all = [];
  let from = 0;
  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    const batch = await rest(url, jwt, `${basePath}${sep}offset=${from}&limit=1000`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return all;
}

const COUNTRY_LABEL_BY_SLUG = {
  "africa-do-sul": "África do Sul",
  alemanha: "Alemanha",
  argentina: "Argentina",
  australia: "Austrália",
  austria: "Áustria",
  brasil: "Brasil",
  bulgaria: "Bulgária",
  chile: "Chile",
  espanha: "Espanha",
  franca: "França",
  grecia: "Grécia",
  hungria: "Hungria",
  italia: "Itália",
  libano: "Líbano",
  marrocos: "Marrocos",
  moldavia: "Moldávia",
  "nova-zelandia": "Nova Zelândia",
  portugal: "Portugal",
  uruguai: "Uruguai",
};

const { url, jwt } = getSupabaseConfig();

const products = await fetchPaged(
  url,
  jwt,
  `/rest/v1/products?select=id,sku,name,slug,is_active,product_type,color,wine_type,grape,short_description,brand,country`,
);
const cats = await fetchPaged(url, jwt, `/rest/v1/categories?select=id,slug,name,is_active`);
const links = await fetchPaged(url, jwt, `/rest/v1/product_categories?select=product_id,category_id`);

const linkedProductIds = new Set(links.map((l) => l.product_id));
const orphans = products.filter((p) => p.is_active && !linkedProductIds.has(p.id));

console.log(`Links carregados: ${links.length}`);
console.log(`Ativos órfãos: ${orphans.length}`);

const updates = [];
for (const p of orphans) {
  const patch = inferFromProduct(p);
  if (Object.keys(patch).length === 0) {
    console.warn(`SEM INFERÊNCIA: ${p.sku} | ${p.name}`);
    continue;
  }
  updates.push({
    id: p.id,
    sku: p.sku,
    name: p.name,
    before: { color: p.color, product_type: p.product_type, country: p.country },
    patch,
  });
}

console.log(`Patches a aplicar: ${updates.length}`);
for (const u of updates) {
  console.log(`  ${u.sku}: ${JSON.stringify(u.patch)}`);
}

if (DRY_RUN) {
  console.log("(dry-run) nada aplicado");
  process.exit(0);
}

for (const u of updates) {
  await rest(url, jwt, `/rest/v1/products?id=eq.${u.id}`, {
    method: "PATCH",
    body: JSON.stringify(u.patch),
    headers: { Prefer: "return=minimal" },
  });
}

for (const u of updates) {
  await rest(url, jwt, `/rest/v1/rpc/sync_product_categories`, {
    method: "POST",
    body: JSON.stringify({ _product_id: u.id }),
    headers: { Prefer: "return=minimal" },
  });
}

const refreshedProducts = await fetchPaged(
  url,
  jwt,
  `/rest/v1/products?select=id,sku,name,is_active,product_type,color,country`,
);
const refreshedLinks = await fetchPaged(url, jwt, `/rest/v1/product_categories?select=product_id,category_id`);
const activeById = new Map(refreshedProducts.map((p) => [p.id, p.is_active]));
const activeCountByCat = new Map();
for (const l of refreshedLinks) {
  if (!activeById.get(l.product_id)) continue;
  activeCountByCat.set(l.category_id, (activeCountByCat.get(l.category_id) ?? 0) + 1);
}

let activated = 0;
for (const c of cats) {
  const n = activeCountByCat.get(c.id) ?? 0;
  if (n > 0 && !c.is_active) {
    await rest(url, jwt, `/rest/v1/categories?id=eq.${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
      headers: { Prefer: "return=minimal" },
    });
    activated++;
    console.log(`Ativada: ${c.slug} (${n} ativos)`);
  }
}

const activeCountryCounts = new Map();
for (const p of refreshedProducts) {
  if (!p.is_active || !p.country) continue;
  activeCountryCounts.set(p.country, (activeCountryCounts.get(p.country) ?? 0) + 1);
}

const finalDelete = [];
for (const c of cats) {
  const linkedActive = activeCountByCat.get(c.id) ?? 0;
  if (linkedActive > 0) continue;
  const countryLabel = COUNTRY_LABEL_BY_SLUG[c.slug];
  if (countryLabel) {
    if ((activeCountryCounts.get(countryLabel) ?? 0) === 0) finalDelete.push(c);
    continue;
  }
  finalDelete.push(c);
}

console.log(`Categorias a remover: ${finalDelete.map((c) => c.slug).join(", ") || "(nenhuma)"}`);

for (const c of finalDelete) {
  await rest(url, jwt, `/rest/v1/product_categories?category_id=eq.${c.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await rest(url, jwt, `/rest/v1/categories?id=eq.${c.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  console.log(`Removida: ${c.slug}`);
}

const afterLinked = new Set(refreshedLinks.map((l) => l.product_id));
// refresh links after sync
const finalLinks = await fetchPaged(url, jwt, `/rest/v1/product_categories?select=product_id`);
const finalLinked = new Set(finalLinks.map((l) => l.product_id));
const stillOrphan = refreshedProducts.filter((p) => p.is_active && !finalLinked.has(p.id));

const report = {
  generatedAt: new Date().toISOString(),
  dryRun: false,
  patched: updates.length,
  updates,
  activated,
  deleted: finalDelete.map((c) => c.slug),
  stillOrphan: stillOrphan.map((p) => ({
    sku: p.sku,
    name: p.name,
    color: p.color,
    product_type: p.product_type,
  })),
};

mkdirSync(path.join("scripts", "data", "backups"), { recursive: true });
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
writeFileSync(path.join("scripts", "data", "backups", `cleanup-empty-cats-${ts}.json`), JSON.stringify(report, null, 2));

console.log(`\nAinda órfãos: ${stillOrphan.length}`);
console.log(`Ativadas: ${activated}`);
console.log(`Removidas: ${finalDelete.length}`);
