import fs from "fs";

const path = process.argv[2] || "c:/Users/rodri/Downloads/wc-product-export-11-7-2026-1783804805511.csv";

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || (c === "\r" && text[i + 1] === "\n")) {
        row.push(field); rows.push(row); row = []; field = "";
        if (c === "\r") i++;
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function extractField(text, label) {
  const re = new RegExp(label + ":\\s*([^\\n<]+)", "i");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractFromHtml(html, label) {
  const patterns = [
    new RegExp(`<strong>\\s*${label}\\s*:?\\s*</strong>\\s*([^<\\n]+)`, "i"),
    new RegExp(`${label}\\s*:\\s*([^<\\n]+)`, "i"),
  ];
  for (const re of patterns) {
    const m = (html || "").match(re);
    if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function cleanValue(v) {
  return v?.replace(/\\n/g, " ").replace(/\s+/g, " ").trim() || null;
}

function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

const STYLE_LABELS = new Set(["brut", "brut rosé", "demi-sec", "moscatel", "blend", "uvas variadas", "espumante branco", "espumante rosé", "moscatel rosé"]);

function parseProduct(shortHtml, longDesc, name) {
  const shortPlain = stripHtml(shortHtml);
  const long = longDesc || "";

  const tipo = extractFromHtml(shortHtml, "Tipo") || (/\bChampagne\b/i.test(name) ? "Espumante" : null);
  const pais = extractFromHtml(shortHtml, "País") || extractFromHtml(shortHtml, "Pais");
  const origem = extractFromHtml(shortHtml, "Origem");
  const uvasShort = extractFromHtml(shortHtml, "Uvas");
  const marca = extractFromHtml(shortHtml, "Marca");

  const uvasLong = (long.match(/(?:Variedade|Uvas):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const regiao = (long.match(/Regi(?:ão|ao):\s*([^\n\r.]+)/i) || [])[1]?.trim();
  const produtor = (long.match(/(?:Produtor|Vin[ií]cola):\s*([^\n\r.]+)/i) || [])[1]?.trim();
  const visao = (long.match(/Vis(?:ão|ao):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const olfato = (long.match(/Olfato:\s*([^\n\r]+)/i) || [])[1]?.trim();
  const paladar = (long.match(/Paladar:\s*([^\n\r]+)/i) || [])[1]?.trim();
  const harmonizacao = (long.match(/Harmoniza(?:ção|cao):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const teor = (long.match(/(?:Teor Alco[oó]lico|Gradua(?:ção|cao) Alco[oó]lica):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const temp = (long.match(/(?:Temperatura(?: Ideal| de (?:consumo|servi[cç]o))?):\s*([^\n\r]+)/i) || [])[1]?.trim();

  let grape = cleanValue(uvasLong) || cleanValue(uvasShort);
  if (grape && STYLE_LABELS.has(grape.toLowerCase()) && uvasLong) grape = cleanValue(uvasLong);
  else if (grape && STYLE_LABELS.has(grape.toLowerCase())) grape = cleanValue(uvasLong) || null;

  let wineType = cleanValue(tipo);
  if (wineType && /^Espumante/i.test(wineType)) wineType = "Espumante";
  if (/\bChampagne\b/i.test(name)) wineType = "Espumante";

  let country = cleanValue(pais);
  if (!country && origem === "Nacional") country = "Brasil";

  let region = cleanValue(origem);
  if (region === "Nacional") region = cleanValue(regiao) || null;
  else if (!region) region = cleanValue(regiao);

  let productType = "vinho";
  if (/espumante|champagne/i.test(`${name} ${tipo || ""}`)) productType = "espumante";
  if (/^kit\b/i.test(name)) productType = "kit";

  const intro = shortPlain.split(/Produto:|Referência:|Tipo:/i)[0].trim();

  return {
    wine_type: wineType,
    country,
    region,
    grape,
    brand: cleanValue(marca) || cleanValue(produtor),
    alcohol_content: teor,
    serving_temp: temp,
    visual_notes: visao,
    nose_notes: olfato,
    palate_notes: paladar,
    harmonization: harmonizacao,
    short_description: intro.slice(0, 300),
    product_type: productType,
  };
}

const text = fs.readFileSync(path, "utf8");
const rows = parseCSV(text);
const headers = rows[0];
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const data = rows.slice(1).filter((r) => r[idx["Nome"]]?.trim());

const cats = {};
let withPromo = 0, kits = 0, espumantes = 0, missingImage = 0;
for (const r of data) {
  const cat = r[idx["Categorias"]] || "(vazio)";
  cats[cat] = (cats[cat] || 0) + 1;
  if (r[idx["Preço promocional"]]) withPromo++;
  if (/^kit\b/i.test(r[idx["Nome"]])) kits++;
  if (/espumante|champagne/i.test(r[idx["Nome"]])) espumantes++;
  if (!r[idx["Imagens"]]?.trim()) missingImage++;
}

const coverage = { tipo: 0, pais: 0, regiao: 0, uvas: 0, marca: 0 };
for (const r of data) {
  const p = parseProduct(r[idx["Descrição curta"]], r[idx["Descrição"]], r[idx["Nome"]]);
  if (p.wine_type) coverage.tipo++;
  if (p.country) coverage.pais++;
  if (p.region) coverage.regiao++;
  if (p.grape) coverage.uvas++;
  if (p.brand) coverage.marca++;
}

const sampleIdx = [0, 1, 3, 4, 11, 12, 20, 26, 50];
const examples = sampleIdx.map((i) => data[i]).filter(Boolean).map((r) => {
  const name = r[idx["Nome"]];
  const parsed = parseProduct(r[idx["Descrição curta"]], r[idx["Descrição"]], name);
  const csvPrice = Number(String(r[idx["Preço promocional"]] || r[idx["Preço"]]).replace(",", "."));
  return {
    wc_id: r[idx["ID"]],
    name,
    slug: slugify(name),
    sku: r[idx["SKU"]],
    gtin: r[idx["GTIN, UPC, EAN, or ISBN"]] || r[idx["Metadado: _wt_feed_gtin"]] || null,
    price_csv: csvPrice,
    price_loja_30off: Math.round(csvPrice * 0.7 * 100) / 100,
    stock: r[idx["Em estoque?"]] === "1" ? 999 : 0,
    image_url: (r[idx["Imagens"]] || "").split(",")[0].trim(),
    category_csv: r[idx["Categorias"]],
    is_active: r[idx["Publicado"]] === "1",
    description_preview: stripHtml(r[idx["Descrição"]]).slice(0, 120) + "...",
    ...parsed,
  };
});

console.log(JSON.stringify({
  total: data.length,
  categorias: cats,
  com_preco_promocional: withPromo,
  kits,
  espumantes,
  sem_imagem: missingImage,
  cobertura_parsing: coverage,
  examples,
}, null, 2));
