/**
 * Exporta para CSV do WooCommerce (pt_BR) os produtos que já entraram em
 * algum pedido (confirmado, pendente, cancelado ou reembolsado).
 * O preço promocional fica vazio: só entra o preço normal (products.price),
 * sem o valor riscado (compare_at_price).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getSupabaseConfig, ROOT } from "./lib/env.mjs";

const OUT = path.join(ROOT, "exports", "woocommerce-produtos-com-vendas.csv");
const SITE = "https://www.galvaovinhos.com";

const { url, jwt } = getSupabaseConfig();
const supabase = createClient(url, jwt, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT_TYPE_LABEL = {
  vinho: "Vinho",
  espumante: "Espumante",
  sangria: "Sangria",
  destilado: "Destilado",
  cerveja: "Cerveja",
  suco: "Suco",
  acessorio: "Acessório",
  gourmet: "Gourmet",
  kit: "Kit",
  outro: "Outro",
};

const HEADERS = [
  "ID",
  "Tipo",
  "SKU",
  "GTIN, UPC, EAN, ou ISBN",
  "Nome",
  "Publicado",
  "Em destaque?",
  "Visibilidade no catálogo",
  "Descrição curta",
  "Descrição",
  "Data de preço promocional começa em",
  "Data de preço promocional termina em",
  "Status do imposto",
  "Classe de imposto",
  "Em estoque?",
  "Estoque",
  "Quantidade baixa de estoque",
  "São permitidas encomendas?",
  "Vendido individualmente?",
  "Peso (kg)",
  "Comprimento (cm)",
  "Largura (cm)",
  "Altura (cm)",
  "Permitir avaliações de clientes?",
  "Observação de compra",
  "Preço promocional",
  "Preço",
  "Categorias",
  "Tags",
  "Classe de entrega",
  "Imagens",
  "Limite de downloads",
  "Dias para expirar o download",
  "Ascendente",
  "Grupo de produtos",
  "Upsells",
  "Venda cruzada",
  "URL externa",
  "Texto do botão",
  "Posição",
  "Marcas",
  "Nome do atributo 1",
  "Valores do atributo 1",
  "Visibilidade do atributo 1",
  "Atributo global 1",
  "Nome do atributo 2",
  "Valores do atributo 2",
  "Visibilidade do atributo 2",
  "Atributo global 2",
  "Nome do atributo 3",
  "Valores do atributo 3",
  "Visibilidade do atributo 3",
  "Atributo global 3",
  "Nome do atributo 4",
  "Valores do atributo 4",
  "Visibilidade do atributo 4",
  "Atributo global 4",
  "Nome do atributo 5",
  "Valores do atributo 5",
  "Visibilidade do atributo 5",
  "Atributo global 5",
  "Nome do atributo 6",
  "Valores do atributo 6",
  "Visibilidade do atributo 6",
  "Atributo global 6",
  "Nome do atributo 7",
  "Valores do atributo 7",
  "Visibilidade do atributo 7",
  "Atributo global 7",
  "Nome do atributo 8",
  "Valores do atributo 8",
  "Visibilidade do atributo 8",
  "Atributo global 8",
];

function csvField(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function wcList(values) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => value.replace(/,/g, "\\,"))
    .join(", ");
}

function priceBr(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(2).replace(".", ",");
}

function absImage(raw) {
  if (!raw) return "";
  const value = typeof raw === "string" ? raw : raw.url || raw.src || raw.image_url || "";
  if (!value) return "";
  const storage = value.match(/^https?:\/\/[^/]+(\/storage\/v1\/[^?#]+)/i);
  if (storage) return `${SITE}${storage[1]}`;
  if (/^https?:\/\//i.test(value)) return value.split("?")[0];
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${SITE}${normalized.split("?")[0]}`;
}

function categoryPath(id, categories) {
  const parts = [];
  const seen = new Set();
  let current = categories.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name.trim());
    current = current.parent_id ? categories.get(current.parent_id) : null;
  }
  return parts.join(" > ");
}

function attributeCells(name, value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return ["", "", "", ""];
  return [name, text.replace(/,/g, "\\,"), "1", "0"];
}

async function fetchAll(build) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

const soldItems = await fetchAll(() =>
  supabase.from("order_items").select("product_id").not("product_id", "is", null),
);

const soldIds = [...new Set(soldItems.map((row) => row.product_id))];
const orphanItems = await fetchAll(() =>
  supabase.from("order_items").select("id, product_name").is("product_id", null),
);

const categories = new Map();
for (const category of await fetchAll(() => supabase.from("categories").select("id, name, parent_id"))) {
  categories.set(category.id, category);
}

const products = [];
for (let index = 0; index < soldIds.length; index += 100) {
  const chunk = soldIds.slice(index, index + 100);
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, sku, gtin, short_description, description, price, compare_at_price, stock, image_url, gallery, is_active, featured, brand, country, region, grape, wine_type, product_type, vintage, alcohol_content, volume_ml, category_id, product_categories(category_id)",
    )
    .in("id", chunk);
  if (error) throw error;
  products.push(...(data ?? []));
}

products.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

const lines = [HEADERS.map(csvField).join(",")];
let withStrikethrough = 0;

for (const product of products) {
  if (product.compare_at_price != null && Number(product.compare_at_price) > Number(product.price)) {
    withStrikethrough += 1;
  }

  const categoryIds = new Set(
    (product.product_categories ?? []).map((row) => row.category_id).filter(Boolean),
  );
  if (product.category_id) categoryIds.add(product.category_id);
  const categoryList = wcList([...categoryIds].map((id) => categoryPath(id, categories)).filter(Boolean));

  const images = [];
  const seenImages = new Set();
  for (const image of [product.image_url, ...(Array.isArray(product.gallery) ? product.gallery : [])]) {
    const url = absImage(image);
    if (!url || seenImages.has(url)) continue;
    seenImages.add(url);
    images.push(url);
  }

  const typeLabel = PRODUCT_TYPE_LABEL[product.product_type] || "";
  const tipo = (product.wine_type || typeLabel || "").trim();
  const volume = product.volume_ml ? `${product.volume_ml} ml` : "";
  const attributes = [
    attributeCells("País", product.country),
    attributeCells("Região", product.region),
    attributeCells("Uva", product.grape),
    attributeCells("Tipo", tipo),
    attributeCells("Safra", product.vintage),
    attributeCells("Volume", volume),
    attributeCells("Teor alcoólico", product.alcohol_content),
    attributeCells("Marca", product.brand),
  ].flat();

  const row = [
    "",
    "simple",
    product.sku || "",
    product.gtin || "",
    product.name || "",
    product.is_active ? "1" : "0",
    product.featured ? "1" : "0",
    "visible",
    product.short_description || "",
    product.description || "",
    "",
    "",
    "taxable",
    "",
    Number(product.stock) > 0 ? "1" : "0",
    String(product.stock ?? 0),
    "",
    "0",
    "0",
    "",
    "",
    "",
    "",
    "1",
    "",
    "",
    priceBr(product.price),
    categoryList,
    "",
    "",
    images.join(", "),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "0",
    product.brand || "",
    ...attributes,
  ];

  if (row.length !== HEADERS.length) {
    throw new Error(`Colunas divergentes em ${product.sku}: ${row.length} vs ${HEADERS.length}`);
  }
  lines.push(row.map(csvField).join(","));
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");

const prices = products.map((product) => Number(product.price)).filter(Number.isFinite);
console.log(
  JSON.stringify(
    {
      file: OUT,
      products: products.length,
      soldIds: soldIds.length,
      missingProducts: soldIds.length - products.length,
      deletedProductLines: orphanItems.length,
      deletedProductNames: [...new Set(orphanItems.map((row) => row.product_name).filter(Boolean))],
      withStrikethroughIgnored: withStrikethrough,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      sample: products.slice(0, 3).map((product) => ({
        sku: product.sku,
        name: product.name,
        price: priceBr(product.price),
        compareAtIgnored: product.compare_at_price,
      })),
    },
    null,
    2,
  ),
);
