import fs from "fs";

export function parseCSV(text) {
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

export function stripHtml(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

export function cleanValue(v) {
  return v?.replace(/\\n/g, " ").replace(/\s+/g, " ").trim() || null;
}

export function slugify(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

const STYLE_LABELS = new Set([
  "brut", "brut rosé", "demi-sec", "moscatel", "blend", "uvas variadas",
  "espumante branco", "espumante rosé", "moscatel rosé",
]);

function normalizeGrape(grape) {
  if (!grape) return null;
  const m = grape.match(/variedade\s+([^.]+)/i);
  if (m) return cleanValue(m[1]);
  return grape.replace(/\.\s*100%.*$/i, "").trim();
}

function splitHarmonizacao(text) {
  if (!text) return [];
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 80)
    .slice(0, 8);
}

export function parseWcRow(row, idx) {
  const name = row[idx["Nome"]]?.trim();
  if (!name) return null;

  const shortHtml = row[idx["Descrição curta"]] || "";
  const longDesc = row[idx["Descrição"]] || "";
  const shortPlain = stripHtml(shortHtml);

  const tipo = extractFromHtml(shortHtml, "Tipo") || (/\bChampagne\b/i.test(name) ? "Espumante" : null);
  const pais = extractFromHtml(shortHtml, "País") || extractFromHtml(shortHtml, "Pais");
  const origem = extractFromHtml(shortHtml, "Origem");
  const uvasShort = extractFromHtml(shortHtml, "Uvas");
  const marcaCsv = cleanValue(row[idx["Marcas"]] || row[idx["Metadado: _wt_feed_brand"]]);

  const uvasLong = (longDesc.match(/(?:Variedade|Uvas):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const regiao = (longDesc.match(/Regi(?:ão|ao):\s*([^\n\r.]+)/i) || [])[1]?.trim();
  const produtor = (longDesc.match(/(?:Produtor|Vin[ií]cola):\s*([^\n\r.]+)/i) || [])[1]?.trim();
  const visao = (longDesc.match(/Vis(?:ão|ao):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const olfato = (longDesc.match(/Olfato:\s*([^\n\r]+)/i) || [])[1]?.trim();
  const paladar = (longDesc.match(/Paladar:\s*([^\n\r]+)/i) || [])[1]?.trim();
  const harmonizacaoText = (longDesc.match(/Harmoniza(?:ção|cao):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const teor = (longDesc.match(/(?:Teor Alco[oó]lico|Gradua(?:ção|cao) Alco[oó]lica):\s*([^\n\r]+)/i) || [])[1]?.trim();
  const temp = (longDesc.match(/(?:Temperatura(?: Ideal| de (?:consumo|servi[cç]o))?):\s*([^\n\r]+)/i) || [])[1]?.trim();

  let grape = normalizeGrape(cleanValue(uvasLong) || cleanValue(uvasShort));
  if (grape && STYLE_LABELS.has(grape.toLowerCase())) {
    grape = normalizeGrape(cleanValue(uvasLong)) || null;
  }

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

  const intro = shortPlain.split(/Produto:|Referência:|Tipo:/i)[0].trim().replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  const promo = row[idx["Preço promocional"]]?.trim();
  const priceRaw = promo || row[idx["Preço"]] || "0";
  const price = Math.round(Number(String(priceRaw).replace(",", ".")) * 100) / 100;
  const imageRemote = (row[idx["Imagens"]] || "").split(",")[0].trim();
  const gtinRaw = row[idx["GTIN, UPC, EAN, or ISBN"]] || row[idx["Metadado: _wt_feed_gtin"]] || "";
  const gtin = gtinRaw.replace(/\D/g, "") || null;

  return {
    wc_id: row[idx["ID"]],
    name,
    slug: slugify(name),
    sku: row[idx["SKU"]] || null,
    gtin,
    price,
    stock: row[idx["Em estoque?"]] === "1" ? 999 : 0,
    is_active: row[idx["Publicado"]] === "1",
    description: longDesc.trim() || null,
    short_description: intro.slice(0, 500) || null,
    wine_type: wineType,
    country,
    region,
    grape,
    brand: marcaCsv || cleanValue(extractFromHtml(shortHtml, "Marca")) || cleanValue(produtor),
    alcohol_content: cleanValue(teor),
    serving_temp: cleanValue(temp),
    visual_notes: cleanValue(visao),
    nose_notes: cleanValue(olfato),
    palate_notes: cleanValue(paladar),
    harmonization: cleanValue(harmonizacaoText),
    harmonizacao: splitHarmonizacao(harmonizacaoText),
    product_type: productType,
    image_remote: imageRemote,
    category_csv: row[idx["Categorias"]] || null,
  };
}

export function loadWcProducts(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCSV(text);
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  return rows.slice(1).map((r) => parseWcRow(r, idx)).filter(Boolean);
}
