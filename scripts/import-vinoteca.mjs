/**
 * 1) Sobe imagens de D:\img1..img6 para Supabase Storage (product-images)
 * 2) Importa D:\products.json para public.products
 *
 * Uso:
 *   node scripts/import-vinoteca.mjs
 *   node scripts/import-vinoteca.mjs --images-only D:\img1 D:\img2 ...
 *   node scripts/import-vinoteca.mjs --fix-urls
 *   node scripts/import-vinoteca.mjs --images-only --fix-urls
 * Requer: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env (ou variáveis de ambiente)
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const JSON_PATH = process.env.PRODUCTS_JSON || "D:\\products.json";
const DEFAULT_IMAGE_DIRS = "D:\\img1,D:\\img2,D:\\img3,D:\\img4,D:\\img5,D:\\img6";
const BUCKET = "product-images";

function parseCli() {
  const args = process.argv.slice(2);
  const flags = new Set();
  const dirs = [];
  for (const arg of args) {
    if (arg.startsWith("--")) flags.add(arg);
    else dirs.push(arg);
  }
  const imageDirs = (
    dirs.length
      ? dirs
      : (process.env.IMAGE_DIRS || DEFAULT_IMAGE_DIRS).split(",")
  )
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    productsOnly: flags.has("--products-only"),
    onlyImages: flags.has("--images-only"),
    fixUrls: flags.has("--fix-urls"),
    forceUpload: flags.has("--force"),
    imageDirs,
  };
}

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function resolveStorageJwt() {
  const fromEnv =
    process.env.SUPABASE_LEGACY_SERVICE_ROLE_KEY || process.env.SUPABASE_STORAGE_JWT;
  if (fromEnv?.startsWith("eyJ")) return fromEnv;
  if (SERVICE_KEY?.startsWith("eyJ")) return SERVICE_KEY;
  try {
    const raw = execSync("supabase projects api-keys --project-ref zsfhnjrotkbzyikkxmnm -o json", {
      encoding: "utf8",
      cwd: ROOT,
    });
    const keys = JSON.parse(raw);
    const legacy = keys.find(
      (k) => k.name === "service_role" && String(k.api_key || "").startsWith("eyJ"),
    );
    return legacy?.api_key ?? null;
  } catch {
    return null;
  }
}

const STORAGE_JWT = resolveStorageJwt();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em D:\\lojadowine\\.env");
  process.exit(1);
}

if (!STORAGE_JWT) {
  console.error(
    "JWT service_role (eyJ...) necessário para upload no Storage.\n" +
      "Adicione SUPABASE_LEGACY_SERVICE_ROLE_KEY no .env (Dashboard → Settings → API → Legacy API Keys)\n" +
      "ou mantenha o Supabase CLI logado (supabase login).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, STORAGE_JWT, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function uploadFileRest(name, buf, contentType) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: STORAGE_JWT,
      Authorization: `Bearer ${STORAGE_JWT}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: { message: `${res.status} ${text}` } };
  }
  return { error: null };
}

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

function basenameFromPath(p) {
  if (!p) return null;
  return p.split("/").pop() || null;
}

const COUNTRY_SLUG = {
  argentina: "argentina",
  brasil: "brasil",
  brazil: "brasil",
  chile: "chile",
  espanha: "espanha",
  spain: "espanha",
  frança: "franca",
  franca: "franca",
  france: "franca",
  itália: "italia",
  italia: "italia",
  italy: "italia",
  portugal: "portugal",
  alemanha: "alemanha",
  germany: "alemanha",
  uruguai: "uruguai",
  uruguay: "uruguai",
  "áfrica do sul": "africa-do-sul",
  "africa do sul": "africa-do-sul",
  "estados unidos": "eua",
  eua: "eua",
  usa: "eua",
  austria: "austria",
  áustria: "austria",
  austrália: "australia",
  australia: "australia",
  grécia: "grecia",
  grecia: "grecia",
  hungria: "hungria",
  bulgária: "bulgaria",
  bulgaria: "bulgaria",
  moldávia: "moldavia",
  moldavia: "moldavia",
  marrocos: "marrocos",
  líbano: "libano",
  libano: "libano",
  "nova zelândia": "nova-zelandia",
  "nova zelandia": "nova-zelandia",
  noruega: "noruega",
};

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.replace(/^\/+|\/+$/g, "");
    if (seg) return seg.slice(0, 200);
  } catch {
    /* ignore */
  }
  return null;
}

function mapColor(tipo, subcategory) {
  const t = norm(tipo || subcategory);
  if (t.includes("tinto")) return "tinto";
  if (t.includes("branco")) return "branco";
  if (t.includes("rose") || t.includes("rosé")) return "rose";
  if (t.includes("misto")) return "misto";
  return null;
}

function mapProductType(category, subcategory) {
  const c = norm(category);
  const s = norm(subcategory);
  if (c.includes("vinho")) return "vinho";
  if (c.includes("espumante") || s.includes("espumante")) return "espumante";
  if (c.includes("sangria") || s.includes("sangria")) return "sangria";
  if (c.includes("destilado") || s.includes("destilado") || s.includes("whisky") || s.includes("gin"))
    return "destilado";
  if (c.includes("cerveja") || s.includes("cerveja")) return "cerveja";
  if (c.includes("gourmet") || c.includes("bar") || c.includes("acessorio")) return "gourmet";
  if (c.includes("kit") || c.includes("combo")) return "kit";
  return "outro";
}

function contentTypeFor(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  return "image/jpeg";
}

function vinSortKey(filename) {
  const m = filename.match(/^VIN(\d+)_(\d+)\./i);
  if (!m) return [Number.MAX_SAFE_INTEGER, filename];
  return [Number(m[1]), Number(m[2])];
}

async function collectImageFiles(imageDirs) {
  const map = new Map();
  for (const dir of imageDirs) {
    if (!existsSync(dir)) {
      console.warn(`Pasta não encontrada: ${dir}`);
      continue;
    }
    const files = await readdir(dir);
    for (const f of files) {
      if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
      map.set(f, path.join(dir, f));
    }
  }
  return map;
}

async function listRemoteFiles() {
  const names = new Set();
  let offset = 0;
  const limit = 1000;
  const base = SUPABASE_URL.replace(/\/$/, "");

  while (true) {
    const res = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        apikey: STORAGE_JWT,
        Authorization: `Bearer ${STORAGE_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit,
        offset,
        prefix: "",
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List storage failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const item of data) {
      if (item?.name) names.add(item.name);
    }
    if (data.length < limit) break;
    offset += limit;
  }

  return names;
}

async function uploadImages(fileMap, { forceUpload = false, remoteNames = new Set() } = {}) {
  const entries = [...fileMap.entries()].sort((a, b) => {
    const ka = vinSortKey(a[0]);
    const kb = vinSortKey(b[0]);
    return ka[0] - kb[0] || ka[1] - kb[1] || a[0].localeCompare(b[0]);
  });

  const pending = forceUpload
    ? entries
    : entries.filter(([name]) => !remoteNames.has(name));

  console.log(`\n=== Upload: ${pending.length} pendentes (${entries.length} locais, ${remoteNames.size} no storage) → ${BUCKET} ===`);
  let ok = 0;
  let skipped = entries.length - pending.length;
  let err = 0;
  const errors = [];
  const concurrency = 4;
  let i = 0;

  async function worker() {
    while (i < pending.length) {
      const idx = i++;
      const [name, localPath] = pending[idx];
      const buf = await readFile(localPath);
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error } = await uploadFileRest(name, buf, contentTypeFor(name));
        if (!error) {
          lastError = null;
          remoteNames.add(name);
          ok++;
          if (ok % 50 === 0) console.log(`  ${ok}/${pending.length} enviadas...`);
          break;
        }
        lastError = error;
        await new Promise((r) => setTimeout(r, attempt * 400));
      }
      if (lastError) {
        err++;
        errors.push({ name, message: lastError.message });
        if (err <= 20) console.error(`  ERRO ${name}: ${lastError.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`Upload: ${ok} OK, ${skipped} já existiam, ${err} erros`);
  if (errors.length > err) console.log(`  (+${errors.length - Math.min(err, 20)} erros adicionais)`);
  console.log("");
  return { ok, err, skipped, remoteNames, errors };
}

function primaryFilenameForSku(sku, uploadedNames) {
  if (!sku) return null;
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const candidate = `${sku}_1.${ext}`;
    if (uploadedNames.has(candidate)) return candidate;
  }
  return null;
}

function mapProduct(p, uploadedNames) {
  const specs = p.specifications ?? {};
  const images = (p.images ?? []).map(basenameFromPath).filter(Boolean);
  const primary =
    basenameFromPath(p.image_primary) ||
    images.find((f) => uploadedNames.has(f)) ||
    primaryFilenameForSku(p.sku, uploadedNames) ||
    images[0] ||
    null;

  const gallery = images.filter((f) => f !== primary);
  const imageUrl = primary && uploadedNames.has(primary) ? storagePath(primary) : null;
  const galleryUrls = gallery
    .filter((f) => uploadedNames.has(f))
    .map((f) => storagePath(f));

  const slug = slugFromUrl(p.url) || `${norm(p.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${p.sku}`.slice(0, 200);
  const country = specs["País"] || specs["Pais"] || null;
  const tipo = specs["Tipo"] || p.subcategory || null;

  const harmonizacao = specs["Harmonização"] || specs["Harmonizacao"];
  const harmonizacaoArr = harmonizacao
    ? harmonizacao.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    sku: p.sku,
    name: p.title,
    slug,
    price: Number(p.price),
    compare_at_price: null,
    stock: p.availability === "InStock" ? 50 : 0,
    description: p.description_html || p.description_text || null,
    short_description: (p.description_text || "").slice(0, 280) || null,
    country,
    grape: specs["Uva"] || null,
    brand: p.brand || specs["Produtor"] || null,
    region: specs["Região"] || specs["Regiao"] || null,
    vintage: specs["Safra"] || null,
    alcohol_content: specs["Teor Alcoólico"] || specs["Teor Alcoolico"] || null,
    serving_temp: specs["Temperatura de Serviço"] || specs["Temperatura de Servico"] || null,
    aging: specs["Envelhecimento"] || null,
    nose_notes: specs["Aroma"] || null,
    palate_notes: specs["Paladar"] || null,
    visual_notes: specs["Visual"] || null,
    harmonizacao: harmonizacaoArr,
    harmonization: harmonizacao || null,
    image_url: imageUrl,
    gallery: galleryUrls,
    featured: false,
    best_seller: false,
    is_active: true,
    is_zero_alcohol: norm(p.subcategory).includes("zero alcool") || norm(tipo).includes("zero alcool"),
    product_type: mapProductType(p.category, p.subcategory),
    color: mapColor(tipo, p.subcategory),
    wine_type: specs["Tipo"] || p.subcategory || null,
    classification: specs["Classificação"] || specs["Classificacao"] || null,
    video_url: (p.videos && p.videos[0]) || null,
  };
}

async function fixProductUrls(products, uploadedNames) {
  console.log(`=== Corrigindo URLs de imagem (${products.length} produtos no JSON) ===`);
  const bySku = new Map(products.map((p) => [p.sku, p]));
  let updated = 0;
  let withImage = 0;
  let missing = 0;
  let page = 0;
  const pageSize = 500;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, sku")
      .order("sku")
      .range(from, to);
    if (error) throw error;
    if (!rows?.length) break;

    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      const updates = chunk.map((row) => {
        const src = bySku.get(row.sku);
        if (!src) return { id: row.id, image_url: null, gallery: [] };
        const mapped = mapProduct(src, uploadedNames);
        return { id: row.id, image_url: mapped.image_url, gallery: mapped.gallery };
      });

      for (const u of updates) {
        const { error: upErr } = await supabase
          .from("products")
          .update({ image_url: u.image_url, gallery: u.gallery })
          .eq("id", u.id);
        if (upErr) {
          console.error(`  ERRO ${u.id}: ${upErr.message}`);
          continue;
        }
        updated++;
        if (u.image_url) withImage++;
        else missing++;
      }
    }

    console.log(`  ${Math.min(to + 1, from + rows.length)} produtos processados...`);
    if (rows.length < pageSize) break;
    page++;
  }

  console.log(`URLs: ${updated} atualizados, ${withImage} com imagem, ${missing} sem imagem no storage\n`);
}

async function importProducts(products, uploadedNames) {
  console.log(`=== Importando ${products.length} produtos ===`);
  let ok = 0;
  let noImage = 0;
  let err = 0;

  const batchSize = 25;
  for (let b = 0; b < products.length; b += batchSize) {
    const batch = products.slice(b, b + batchSize).map((p) => mapProduct(p, uploadedNames));
    const { data, error } = await supabase.from("products").upsert(batch, { onConflict: "slug" }).select("id, slug");
    if (error) {
      console.error(`Batch ${b}: ${error.message}`);
      err += batch.length;
      continue;
    }
    for (const row of batch) {
      if (!row.image_url) noImage++;
    }
    ok += data?.length ?? batch.length;
    if (ok % 100 === 0 || b + batchSize >= products.length) {
      console.log(`  ${Math.min(b + batchSize, products.length)}/${products.length} processados...`);
    }
  }

  console.log(`\nImportação: ${ok} produtos, ${noImage} sem imagem no storage, ${err} erros`);
  console.log("Categorias serão sincronizadas pelos triggers derive_product_taxonomy + sync_product_categories.");
}

async function main() {
  const cli = parseCli();
  console.log(`Pastas: ${cli.imageDirs.join(", ")}`);

  const fileMap = await collectImageFiles(cli.imageDirs);
  let remoteNames = await listRemoteFiles();
  console.log(`Storage remoto: ${remoteNames.size} arquivos | Local: ${fileMap.size} arquivos`);

  if (!cli.productsOnly) {
    const result = await uploadImages(fileMap, {
      forceUpload: cli.forceUpload,
      remoteNames,
    });
    remoteNames = result.remoteNames;
  }

  const uploadedNames = new Set([...remoteNames, ...fileMap.keys()]);

  if (!existsSync(JSON_PATH)) {
    if (!cli.onlyImages && !cli.fixUrls) {
      console.error(`JSON não encontrado: ${JSON_PATH}`);
      process.exit(1);
    }
  } else {
    const products = JSON.parse(await readFile(JSON_PATH, "utf8"));
    if (cli.fixUrls || cli.onlyImages) {
      await fixProductUrls(products, uploadedNames);
    }
    if (!cli.onlyImages && !cli.fixUrls) {
      await importProducts(products, uploadedNames);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
