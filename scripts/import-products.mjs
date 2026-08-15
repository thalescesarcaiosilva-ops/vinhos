/**
 * Importa produtos de um JSON + imagens locais para Supabase Storage.
 *
 * Uso:
 *   1. Coloque o JSON em scripts/data/products.json
 *   2. Coloque as imagens em scripts/data/images/ (nomes devem bater com image_url do JSON)
 *   3. Configure .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   4. node scripts/import-products.mjs
 *
 * Formato esperado do JSON (array ou { products: [...] }):
 * {
 *   "sku": "VIN001",
 *   "name": "Nome do vinho",
 *   "slug": "nome-do-vinho-vin001",
 *   "price": 89.90,
 *   "compare_at_price": 99.90,
 *   "stock": 10,
 *   "description": "...",
 *   "short_description": "...",
 *   "country": "Brasil",
 *   "grape": "Cabernet Sauvignon",
 *   "image": "VIN001_1.jpg",
 *   "gallery": ["VIN001_2.jpg"],
 *   "category_slugs": ["tintos", "brasil"],
 *   "featured": false,
 *   "best_seller": false,
 *   "is_active": true
 * }
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const JSON_PATH = path.join(DATA_DIR, "products.json");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const BUCKET = "product-images";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function storagePath(filename) {
  return `/storage/v1/object/public/${BUCKET}/${filename}`;
}

async function uploadImage(filename) {
  const local = path.join(IMAGES_DIR, filename);
  if (!existsSync(local)) {
    return { filename, status: "missing" };
  }
  const buf = await readFile(local);
  const ext = path.extname(filename).toLowerCase();
  const contentType =
    ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : "image/jpeg";

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buf, {
    contentType,
    upsert: true,
  });
  if (error) return { filename, status: "error", message: error.message };
  return { filename, status: "ok", url: storagePath(filename) };
}

async function loadProducts() {
  const raw = JSON.parse(await readFile(JSON_PATH, "utf8"));
  return Array.isArray(raw) ? raw : raw.products ?? [];
}

async function main() {
  if (!existsSync(JSON_PATH)) {
    console.error(`Arquivo não encontrado: ${JSON_PATH}`);
    console.error("Envie o JSON para scripts/data/products.json e rode novamente.");
    process.exit(1);
  }

  const products = await loadProducts();
  console.log(`Produtos no JSON: ${products.length}`);

  // Upload de todas as imagens da pasta (se existir)
  const uploaded = new Map();
  if (existsSync(IMAGES_DIR)) {
    const files = await readdir(IMAGES_DIR);
    console.log(`Imagens na pasta: ${files.length}`);
    for (const f of files) {
      if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
      const r = await uploadImage(f);
      uploaded.set(f, r);
      if (r.status === "ok") process.stdout.write(".");
      else console.warn(`\n  [${r.status}] ${f}${r.message ? ": " + r.message : ""}`);
    }
    console.log("\nUpload concluído.");
  }

  let ok = 0;
  let err = 0;

  for (const p of products) {
    const mainImage = p.image || p.image_url?.split("/").pop();
    const galleryFiles = (p.gallery ?? []).map((g) =>
      typeof g === "string" ? g.split("/").pop() : g,
    );

    const imageUrl = mainImage ? storagePath(mainImage) : null;
    const gallery = galleryFiles
      .filter(Boolean)
      .map((f) => storagePath(f));

    const row = {
      sku: p.sku ?? null,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
      stock: Number(p.stock ?? 0),
      description: p.description ?? null,
      short_description: p.short_description ?? null,
      country: p.country ?? null,
      grape: p.grape ?? null,
      brand: p.brand ?? null,
      region: p.region ?? null,
      vintage: p.vintage ?? null,
      alcohol_content: p.alcohol_content ?? null,
      image_url: imageUrl,
      gallery,
      featured: !!p.featured,
      best_seller: !!p.best_seller,
      is_active: p.is_active !== false,
      product_type: p.product_type ?? "vinho",
      color: p.color ?? null,
      harmonizacao: p.harmonizacao ?? [],
      selo: p.selo ?? [],
    };

    const { data, error } = await supabase
      .from("products")
      .upsert(row, { onConflict: "slug" })
      .select("id, slug")
      .single();

    if (error) {
      console.error(`ERRO ${p.slug}:`, error.message);
      err++;
      continue;
    }

    // Vincular categorias
    const slugs = p.category_slugs ?? p.categories ?? [];
    if (slugs.length && data?.id) {
      const { data: cats } = await supabase
        .from("categories")
        .select("id, slug")
        .in("slug", slugs);
      if (cats?.length) {
        await supabase.from("product_categories").delete().eq("product_id", data.id);
        await supabase.from("product_categories").insert(
          cats.map((c) => ({ product_id: data.id, category_id: c.id })),
        );
      }
    }

    ok++;
    if (ok % 50 === 0) console.log(`  ${ok} produtos importados...`);
  }

  console.log(`\nConcluído: ${ok} OK, ${err} erros.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
