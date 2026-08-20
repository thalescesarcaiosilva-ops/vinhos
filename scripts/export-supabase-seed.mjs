/**
 * Exporta pacote portátil para clonar o schema Galvao + catálogo (produtos/categorias)
 * em um NOVO projeto Supabase — sem alterar o projeto atual.
 *
 * Uso: node scripts/export-supabase-seed.mjs
 * Saída: exports/galvao-supabase-seed/
 */
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ROOT, getSupabaseConfig } from "./lib/env.mjs";

const OUT = path.join(ROOT, "exports", "galvao-supabase-seed");
const PAGE = 1000;
const CONCURRENCY = 8;

async function restAll(url, jwt, table, select = "*", order = "id") {
  const all = [];
  let from = 0;
  while (true) {
    const qs = `select=${encodeURIComponent(select)}&order=${order}&offset=${from}&limit=${PAGE}`;
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: jwt,
        Authorization: `Bearer ${jwt}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!rows?.length) break;
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function listStorage(url, jwt, bucket, prefix = "") {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/storage/v1/object/list/${bucket}`,
      {
        method: "POST",
        headers: {
          apikey: jwt,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
      },
    );
    if (!res.ok) throw new Error(`list ${bucket}: ${res.status} ${await res.text()}`);
    const items = await res.json();
    if (!items?.length) break;
    for (const item of items) {
      if (item.id == null && item.name && !item.metadata) {
        // pasta — listar recursivo
        const sub = await listStorage(url, jwt, bucket, prefix ? `${prefix}/${item.name}` : item.name);
        all.push(...sub);
      } else if (item.name) {
        all.push({
          name: prefix ? `${prefix}/${item.name}` : item.name,
          size: item.metadata?.size ?? null,
          mimetype: item.metadata?.mimetype ?? null,
        });
      }
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return all;
}

function extractStoragePath(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/\/storage\/v1\/object\/public\/product-images\/(.+)$/i);
  if (m) return decodeURIComponent(m[1].split("?")[0]);
  if (!s.includes("://") && !s.startsWith("/")) return s.replace(/^product-images\//, "");
  const m2 = s.match(/product-images\/(.+)$/i);
  return m2 ? decodeURIComponent(m2[1].split("?")[0]) : null;
}

function collectImagePaths(products) {
  const set = new Set();
  for (const p of products) {
    const primary = extractStoragePath(p.image_url);
    if (primary) set.add(primary);
    const gallery = Array.isArray(p.gallery) ? p.gallery : [];
    for (const g of gallery) {
      const pathName = extractStoragePath(typeof g === "string" ? g : g?.url || g?.path);
      if (pathName) set.add(pathName);
    }
  }
  return [...set];
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function downloadFile(url, jwt, bucket, objectPath, destPath) {
  mkdirSync(path.dirname(destPath), { recursive: true });
  if (existsSync(destPath)) {
    return { objectPath, destPath, skipped: true, ok: true };
  }
  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(publicUrl, {
    headers: { apikey: jwt, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    return { objectPath, destPath, ok: false, status: res.status, error: await res.text() };
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
  return { objectPath, destPath, ok: true, skipped: false };
}

function copyMigrations() {
  const srcDir = path.join(ROOT, "supabase", "migrations");
  const destDir = path.join(OUT, "schema", "migrations");
  mkdirSync(destDir, { recursive: true });
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    copyFileSync(path.join(srcDir, f), path.join(destDir, f));
  }
  return files;
}

function writeStorageBootstrap() {
  const sql = `-- Buckets + policies (idempotente). Rode no SQL Editor do NOVO projeto se as migrations não criarem tudo.
-- Não execute no projeto Galvao atual.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-images', 'product-images', true),
  ('banner-images', 'banner-images', true),
  ('pix-receipts', 'pix-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- product-images
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
CREATE POLICY "Admins upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
CREATE POLICY "Admins update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
CREATE POLICY "Admins delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

-- banner-images
DROP POLICY IF EXISTS "Public read banner images" ON storage.objects;
CREATE POLICY "Public read banner images" ON storage.objects FOR SELECT USING (bucket_id = 'banner-images');
DROP POLICY IF EXISTS "Admins upload banner images" ON storage.objects;
CREATE POLICY "Admins upload banner images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update banner images" ON storage.objects;
CREATE POLICY "Admins update banner images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete banner images" ON storage.objects;
CREATE POLICY "Admins delete banner images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));
`;
  writeFileSync(path.join(OUT, "schema", "00_storage_buckets.sql"), sql, "utf8");
}

function writeReadme(meta) {
  const md = `# Pacote de seed — Galvao → novo Supabase

Exportado em **${meta.exported_at}** a partir do projeto \`${meta.source_project}\` (somente leitura).

## Conteúdo

| Pasta | O que é |
|-------|---------|
| \`schema/migrations/\` | ${meta.migration_count} migrations (DDL, RLS, functions, triggers) — schema igual ao atual |
| \`schema/00_storage_buckets.sql\` | Buckets + policies de Storage |
| \`data/*.json\` | Categorias + produtos + vínculos + suggestions |
| \`storage/product-images/\` | Arquivos de imagem baixados |
| \`manifests/\` | Metadados e mapa de imagens |

## O que vem preenchido vs vazio

- **Preenchido:** \`categories\`, \`products\`, \`product_categories\`, \`product_suggestions\` + imagens do bucket \`product-images\`
- **Vazio (só estrutura):** pedidos, clientes, cupons, banners, settings, webhooks, newsletter, etc.

## Importação (quando tiver o novo projeto)

1. Crie um projeto Supabase novo (Dashboard).
2. Apunte MCP/\`.env\` / \`supabase link\` **para o novo** \`project_ref\` (não use o Galvao).
3. Aplique o schema:
   - Copie \`schema/migrations/*\` para \`supabase/migrations/\` do app (ou use esta pasta) e rode \`npx supabase db push --linked\`, **ou**
   - Rode as migrations em ordem no SQL Editor.
4. Rode \`schema/00_storage_buckets.sql\` no novo projeto.
5. Importe dados + imagens:
   \`\`\`bash
   node scripts/import-supabase-seed.mjs --dir exports/galvao-supabase-seed
   \`\`\`
   (O script de import só existe/rodará contra o projeto configurado no \`.env\` — confira a URL antes.)

## Contagens neste export

- categories: ${meta.counts.categories}
- products: ${meta.counts.products}
- product_categories: ${meta.counts.product_categories}
- product_suggestions: ${meta.counts.product_suggestions}
- imagens referenciadas: ${meta.counts.image_paths}
- arquivos baixados OK: ${meta.counts.images_ok}
- falhas download: ${meta.counts.images_failed}

## Importante

- Este pacote **não altera** o projeto Galvao (\`aufvvgytbrstsrfomngm\`).
- URLs de imagem no JSON são relativas (\`/storage/v1/object/public/product-images/...\`). Após reupload no novo bucket com o mesmo path, continuam válidas.
`;
  writeFileSync(path.join(OUT, "README.md"), md, "utf8");
}

async function main() {
  const { url, jwt } = getSupabaseConfig();
  mkdirSync(path.join(OUT, "data"), { recursive: true });
  mkdirSync(path.join(OUT, "storage", "product-images"), { recursive: true });
  mkdirSync(path.join(OUT, "manifests"), { recursive: true });
  mkdirSync(path.join(OUT, "schema"), { recursive: true });

  console.log("1/5 Copiando migrations...");
  const migrations = copyMigrations();
  writeStorageBootstrap();

  console.log("2/5 Exportando tabelas (REST)...");
  const [categories, products, product_categories, product_suggestions] = await Promise.all([
    restAll(url, jwt, "categories", "*", "id"),
    restAll(url, jwt, "products", "*", "id"),
    restAll(url, jwt, "product_categories", "*", "product_id,category_id"),
    restAll(url, jwt, "product_suggestions", "*", "product_id,suggested_product_id"),
  ]);

  writeFileSync(path.join(OUT, "data", "categories.json"), JSON.stringify(categories, null, 2));
  writeFileSync(path.join(OUT, "data", "products.json"), JSON.stringify(products, null, 2));
  writeFileSync(path.join(OUT, "data", "product_categories.json"), JSON.stringify(product_categories, null, 2));
  writeFileSync(path.join(OUT, "data", "product_suggestions.json"), JSON.stringify(product_suggestions, null, 2));

  console.log(`   categories=${categories.length} products=${products.length} links=${product_categories.length} suggestions=${product_suggestions.length}`);

  console.log("3/5 Listando storage product-images...");
  let storageObjects = [];
  try {
    storageObjects = await listStorage(url, jwt, "product-images");
    writeFileSync(path.join(OUT, "manifests", "storage-list.json"), JSON.stringify(storageObjects, null, 2));
    console.log(`   objetos no bucket: ${storageObjects.length}`);
  } catch (e) {
    console.warn("   aviso list storage:", e.message);
  }

  const fromProducts = collectImagePaths(products);
  const fromBucket = storageObjects.map((o) => o.name);
  const imagePaths = [...new Set([...fromProducts, ...fromBucket])].sort();
  writeFileSync(path.join(OUT, "manifests", "image-paths.json"), JSON.stringify(imagePaths, null, 2));
  console.log(`4/5 Baixando ${imagePaths.length} imagens (concorrência ${CONCURRENCY})...`);

  const results = await mapPool(imagePaths, CONCURRENCY, async (objectPath, idx) => {
    if (idx > 0 && idx % 100 === 0) console.log(`   ... ${idx}/${imagePaths.length}`);
    const destPath = path.join(OUT, "storage", "product-images", ...objectPath.split("/"));
    return downloadFile(url, jwt, "product-images", objectPath, destPath);
  });

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(OUT, "manifests", "download-results.json"), JSON.stringify({ ok: ok.length, failed }, null, 2));

  const meta = {
    exported_at: new Date().toISOString(),
    source_project: "aufvvgytbrstsrfomngm",
    source_url: url,
    migration_count: migrations.length,
    counts: {
      categories: categories.length,
      products: products.length,
      product_categories: product_categories.length,
      product_suggestions: product_suggestions.length,
      image_paths: imagePaths.length,
      images_ok: ok.length,
      images_failed: failed.length,
    },
  };
  writeFileSync(path.join(OUT, "manifests", "export-meta.json"), JSON.stringify(meta, null, 2));
  writeReadme(meta);

  // stub import script pointer
  const importHint = path.join(OUT, "IMPORT.txt");
  writeFileSync(
    importHint,
    "Quando o novo projeto existir, use: node scripts/import-supabase-seed.mjs --dir exports/galvao-supabase-seed\nConfirme SUPABASE_URL no .env apontando para o NOVO projeto.\n",
    "utf8",
  );

  console.log("5/5 Concluído.");
  console.log(`Pacote: ${OUT}`);
  console.log(JSON.stringify(meta.counts, null, 2));
  if (failed.length) {
    console.warn(`Falhas de download: ${failed.length} (ver manifests/download-results.json)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
