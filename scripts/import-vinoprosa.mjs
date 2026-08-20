/**
 * Importa catálogo Vinoteca Vinho Prosa → Supabase (Galvao).
 *
 * Uso:
 *   node scripts/import-vinoprosa.mjs --all
 *   node scripts/import-vinoprosa.mjs --clean
 *   node scripts/import-vinoprosa.mjs --import
 *   node scripts/import-vinoprosa.mjs --images
 *   node scripts/import-vinoprosa.mjs --images --mb-limit 45
 *
 * JSON padrão: D:\importarprodutos\exportados\vinoteca_vinhoprosa_20260623_181718_completo.json
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_JSON =
  "D:\\importarprodutos\\exportados\\vinoteca_vinhoprosa_20260623_181718_completo.json";
const BUCKET = "product-images";
const STATE_PATH = path.join(ROOT, ".tmp", "vinoprosa-import-state.json");

const rawArgv = process.argv.slice(2);
const args = new Set(rawArgv.filter((a) => a.startsWith("--")));
const flagValues = new Set(
  rawArgv.flatMap((a, i) => (a.startsWith("--") && rawArgv[i + 1] && !rawArgv[i + 1].startsWith("--") ? [rawArgv[i + 1]] : [])),
);
const jsonPath = rawArgv.find((a) => !a.startsWith("--") && !flagValues.has(a)) || DEFAULT_JSON;
const mbLimit = Number(rawArgv[rawArgv.indexOf("--mb-limit") + 1] || 45);

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function resolveJwt() {
  const fromEnv = process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (sk?.startsWith("eyJ")) return sk;
  const keys = JSON.parse(
    execSync("supabase projects api-keys --project-ref aufvvgytbrstsrfomngm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    }),
  );
  return keys.find((k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"))?.api_key;
}

loadEnv();
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const JWT = resolveJwt();
if (!SUPABASE_URL || !JWT) {
  console.error("Configure SUPABASE_URL e JWT service_role (eyJ...) em .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, JWT, { auth: { persistSession: false } });

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

function slugFromUrl(url) {
  try {
    const seg = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    return seg.slice(0, 200) || null;
  } catch {
    return null;
  }
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeGtinLocal(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

function extFromUrl(url) {
  const clean = url.split("?")[0];
  const m = clean.match(/\.(jpe?g|png|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

function mapProductType(categorias, nome, specs) {
  const cats = (categorias || []).map((c) => norm(c));
  const tipo = norm(specs?.Tipo || "");
  if (cats.some((c) => /kit|combo/.test(c))) return "kit";
  if (cats.some((c) => /espumante|champagne/.test(c)) || tipo.includes("espumante")) return "espumante";
  if (cats.includes("vinhos") || tipo.includes("vinho")) return "vinho";
  if (tipo.includes("sangria")) return "sangria";
  return "vinho";
}

function mapColor(categorias, specs, nome) {
  const cats = (categorias || []).join(" ").toLowerCase();
  const tipo = norm(specs?.Tipo || "");
  const n = norm(nome);
  if (cats.includes("tintos") || tipo.includes("tinto") || n.includes(" tinto")) return "tinto";
  if (cats.includes("brancos") || tipo.includes("branco") || n.includes(" branco")) return "branco";
  if (cats.includes("roses") || cats.includes("rosés") || tipo.includes("rose") || n.includes(" rose"))
    return "rose";
  return null;
}

function splitHarmonizacao(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 120)
    .slice(0, 12);
}

function mapProduct(p, uploadedNames) {
  const specs = p.caracteristicas || {};
  const sku = p.sku?.trim();
  const slug = slugFromUrl(p.url) || `${norm(p.nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${sku}`.slice(0, 200);
  const productType = mapProductType(p.categorias, p.nome, specs);
  const color = mapColor(p.categorias, specs, p.nome);
  const zero =
    norm(p.nome).includes("zero alcool") ||
    norm(specs.Tipo || "").includes("zero alcool") ||
    norm(p.descricao || "").includes("zero alcool");

  const imageFiles = [];
  for (let i = 0; i < (p.imagens || []).length; i++) {
    const ext = extFromUrl(p.imagens[i]);
    imageFiles.push(`${sku}_${i + 1}.${ext}`);
  }

  const primary = imageFiles[0];
  const imageUrl = primary && uploadedNames.has(primary) ? storagePath(primary) : null;
  const gallery = imageFiles
    .slice(1)
    .filter((f) => uploadedNames.has(f))
    .map((f) => storagePath(f));

  const compare = Number(p.preco_original);
  const price = Number(p.preco) || 0;

  return {
    sku,
    name: p.nome?.trim(),
    slug,
    short_description: (p.descricao_curta || "").trim() || null,
    description: p.descricao || null,
    country: specs["País"] || specs["Pais"] || null,
    region: specs["Região"] || specs["Regiao"] || null,
    grape: specs["Uva"] || null,
    wine_type: specs["Tipo"] || null,
    classification: specs["Classificação"] || specs["Classificacao"] || null,
    brand: specs["Produtor"] || p.marca || null,
    vintage: specs["Safra"] || null,
    serving_temp: specs["Temperatura de Serviço"] || specs["Temperatura de Servico"] || null,
    aging: specs["Envelhecimento"] || null,
    alcohol_content: specs["Teor Alcoólico"] || specs["Teor Alcoolico"] || null,
    visual_notes: specs["Visual"] || null,
    nose_notes: specs["Aroma"] || null,
    palate_notes: specs["Paladar"] || null,
    harmonization: specs["Harmonização"] || specs["Harmonizacao"] || null,
    harmonizacao: splitHarmonizacao(specs["Harmonização"] || specs["Harmonizacao"]),
    price,
    compare_at_price: compare > price ? compare : null,
    stock: Number(p.estoque) || 0,
    gtin: normalizeGtinLocal(p.gtin),
    image_url: imageUrl,
    gallery,
    featured: false,
    best_seller: false,
    is_active: true,
    rating: p.nota && Number(p.nota) > 0 ? Number(p.nota) : null,
    product_type: productType,
    color,
    is_zero_alcohol: zero,
  };
}

async function listRemoteFiles() {
  const names = new Set();
  let offset = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        apikey: JWT,
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 1000, offset, prefix: "", sortBy: { column: "name", order: "asc" } }),
    });
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    for (const item of data) {
      if (item?.name && !item.name.startsWith(".")) names.add(item.name);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return names;
}

async function deleteAllStorage() {
  const files = [...(await listRemoteFiles())];
  console.log(`Removendo ${files.length} arquivos do bucket ${BUCKET}...`);
  for (let i = 0; i < files.length; i += 100) {
    const chunk = files.slice(i, i + 100);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: JWT,
        Authorization: `Bearer ${JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!res.ok) {
      // fallback: delete one by one
      for (const name of chunk) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
          method: "DELETE",
          headers: { apikey: JWT, Authorization: `Bearer ${JWT}` },
        });
      }
    }
  }
  console.log("Storage limpo.");
}

async function cleanCatalog() {
  console.log("Limpando catálogo...");
  const tables = [
    "coupon_redemptions",
    "order_status_history",
    "order_items",
    "orders",
    "webhook_events",
    "reviews",
    "favorites",
    "product_grapes",
    "product_categories",
    "products",
    "banners",
    "contact_messages",
  ];
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error && !error.message.includes("does not exist")) {
      // orders etc may use different pk - use raw SQL via rpc not available
      console.warn(`  ${t}: ${error.message}`);
    }
  }
  // Fallback SQL for tables with complex constraints
  const { error } = await supabase.rpc("exec_sql", {
    query: `
      DELETE FROM public.coupon_redemptions;
      DELETE FROM public.order_status_history;
      DELETE FROM public.order_items;
      DELETE FROM public.orders;
      DELETE FROM public.reviews;
      DELETE FROM public.favorites;
      DELETE FROM public.product_grapes;
      DELETE FROM public.product_categories;
      DELETE FROM public.products;
      DELETE FROM public.banners;
    `,
  });
  if (error) {
    // delete products only via supabase - already tried
    await supabase.from("product_categories").delete().gte("product_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("products").delete().gte("created_at", "1970-01-01");
  }
  console.log("Catálogo limpo.");
}

async function cleanCatalogSql() {
  console.log("Limpando catálogo via SQL...");
  execSync(
    `supabase db query --linked "DELETE FROM public.product_categories; DELETE FROM public.product_grapes; DELETE FROM public.favorites; DELETE FROM public.reviews; DELETE FROM public.order_items; DELETE FROM public.orders; DELETE FROM public.products; DELETE FROM public.banners;"`,
    { cwd: ROOT, stdio: "inherit" },
  );
}

async function uploadFile(name, buf, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: JWT,
      Authorization: `Bearer ${JWT}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) return { error: await res.text() };
  return { error: null };
}

function contentTypeFor(name, fallback) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  return fallback || "image/jpeg";
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { uploaded: [], productIndex: 0 };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "GalvaoImport/1.0", Accept: "image/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get("content-type") || "image/jpeg" };
}

async function importProducts(products, uploadedNames) {
  console.log(`\n=== Importando ${products.length} produtos ===`);
  const mapped = products.map((p) => mapProduct(p, uploadedNames)).filter((p) => p.sku && p.slug && p.name);
  let ok = 0;
  for (let b = 0; b < mapped.length; b += 20) {
    const batch = mapped.slice(b, b + 20);
    const { error } = await supabase.from("products").insert(batch);
    if (error) {
      // retry upsert by slug
      for (const row of batch) {
        const { error: e2 } = await supabase.from("products").upsert(row, { onConflict: "slug" });
        if (!e2) ok++;
        else console.error(`  ${row.sku}: ${e2.message}`);
      }
    } else {
      ok += batch.length;
    }
    if ((b + 20) % 100 === 0 || b + 20 >= mapped.length) {
      console.log(`  ${Math.min(b + 20, mapped.length)}/${mapped.length}`);
    }
  }
  const withImg = mapped.filter((p) => p.image_url).length;
  console.log(`Importados: ${ok} | Com imagem no storage: ${withImg}`);
}

async function updateProductImages(products, uploadedNames) {
  const bySku = new Map(products.map((p) => [p.sku?.trim(), p]));
  let from = 0;
  let updated = 0;
  while (true) {
    const { data, error } = await supabase.from("products").select("id, sku").range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const src = bySku.get(row.sku);
      if (!src) continue;
      const mapped = mapProduct(src, uploadedNames);
      const { error: e2 } = await supabase
        .from("products")
        .update({ image_url: mapped.image_url, gallery: mapped.gallery })
        .eq("id", row.id);
      if (!e2) updated++;
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`URLs de imagem atualizadas: ${updated}`);
}

async function uploadImagesBatch(products) {
  const byteLimit = mbLimit * 1024 * 1024;
  const remote = await listRemoteFiles();
  const state = loadState();
  const uploaded = new Set([...remote, ...state.uploaded]);

  let bytes = 0;
  let count = 0;
  let startIdx = state.productIndex || 0;

  console.log(`\n=== Upload imagens (limite ${mbLimit}MB, a partir do produto #${startIdx + 1}) ===`);

  for (let pi = startIdx; pi < products.length; pi++) {
    const p = products[pi];
    const sku = p.sku?.trim();
    if (!sku || !p.imagens?.length) continue;

    for (let i = 0; i < p.imagens.length; i++) {
      const ext = extFromUrl(p.imagens[i]);
      const name = `${sku}_${i + 1}.${ext}`;
      if (uploaded.has(name)) continue;

      if (bytes >= byteLimit) {
        state.productIndex = pi;
        state.uploaded = [...uploaded];
        saveState(state);
        console.log(`Limite de ${mbLimit}MB atingido. Retome com: node scripts/import-vinoprosa.mjs --images`);
        console.log(`Enviados nesta sessão: ${count} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
        return uploaded;
      }

      try {
        const { buf, contentType } = await downloadImage(p.imagens[i]);
        bytes += buf.length;
        const { error } = await uploadFile(name, buf, contentTypeFor(name, contentType));
        if (error) {
          console.error(`  ERRO ${name}: ${error}`);
          continue;
        }
        uploaded.add(name);
        count++;
        if (count % 25 === 0) console.log(`  ${count} imagens (${(bytes / 1024 / 1024).toFixed(1)} MB)...`);
      } catch (e) {
        console.error(`  ERRO download ${name}: ${e.message}`);
      }
    }
  }

  state.productIndex = products.length;
  state.uploaded = [...uploaded];
  saveState(state);
  console.log(`Upload completo: ${count} novas imagens (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  return uploaded;
}

async function main() {
  if (!existsSync(jsonPath)) {
    console.error(`JSON não encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const products = JSON.parse(readFileSync(jsonPath, "utf8"));
  console.log(`JSON: ${products.length} produtos`);

  const doClean = args.has("--clean") || args.has("--all");
  const doImport = args.has("--import") || args.has("--all");
  const doImages = args.has("--images") || args.has("--all");
  const resetState = args.has("--reset-state");

  if (resetState && existsSync(STATE_PATH)) {
    unlinkSync(STATE_PATH);
    console.log("Estado de upload resetado.");
  }

  if (doClean) {
    await cleanCatalogSql();
    await deleteAllStorage();
    if (existsSync(STATE_PATH)) unlinkSync(STATE_PATH);
  }

  let uploaded = await listRemoteFiles();

  if (doImport) {
    await importProducts(products, uploaded);
    for (let from = 0; ; from += 100) {
      const { data } = await supabase.from("products").select("id").range(from, from + 99);
      if (!data?.length) break;
      for (const row of data) {
        await supabase.rpc("sync_product_categories", { _product_id: row.id });
      }
    }
    console.log("Categorias sincronizadas.");
  }

  if (doImages) {
    uploaded = await uploadImagesBatch(products);
    await updateProductImages(products, uploaded);
  }

  const { count } = await supabase.from("products").select("*", { count: "exact", head: true });
  const remote = await listRemoteFiles();
  console.log(`\nResumo: ${count ?? "?"} produtos | ${remote.size} imagens no storage`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
