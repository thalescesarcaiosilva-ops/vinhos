import { htmlToPlainText } from "@/lib/html-content";

export type StoryAward = { year: string; labels: string[] };

export type StorySource = {
  name: string;
  short_description?: string | null;
  description?: string | null;
  country?: string | null;
  region?: string | null;
  grape?: string | null;
  wine_type?: string | null;
  color?: string | null;
  brand?: string | null;
  vintage?: string | null;
  alcohol_content?: string | null;
  visual_notes?: string | null;
  nose_notes?: string | null;
  palate_notes?: string | null;
  classification?: string | null;
  wine_style?: string | null;
  aging?: string | null;
  serving_temp?: string | null;
  harmonization?: string | null;
  harmonizacao?: string[] | null;
};

export type ProductStory = {
  about: string | null;
  tasteColor: string | null;
  aroma: string | null;
  palate: string | null;
  awards: StoryAward[];
  producer: string | null;
  disclaimer: string | null;
  tipo: string | null;
  grape: string | null;
  harvest: string | null;
  alcohol: string | null;
  region: string | null;
  founded: string | null;
  vintageVaries: boolean;
};

const COLOR_LABEL: Record<string, string> = {
  tinto: "Tinto",
  branco: "Branco",
  rose: "Rosé",
  misto: "Misto",
};

function plain(value: string | null | undefined): string {
  return htmlToPlainText(value).replace(/\s+/g, " ").trim();
}

function tidy(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  return text.length > 0 ? text : null;
}

function sentence(value: string | null | undefined): string | null {
  const text = tidy(value);
  if (!text) return null;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function isNarrative(text: string): boolean {
  if (text.length < 40) return false;
  return !/premia[cç]|pa[ií]s:|degusta|caracter[ií]sticas|gradua[cç]/i.test(text);
}

function parseAwards(text: string): StoryAward[] {
  const block = text.match(
    /PREMIA[CÇ][OÕ]ES:\s*([\s\S]*?)(?=Imagem meramente|Caracter[ií]sticas|Pa[ií]s:|Degusta[cç]|Produtor:|$)/i,
  );
  if (!block) return [];
  const awards: StoryAward[] = [];
  const re = /((?:19|20)\d{2})\s*:\s*([\s\S]*?)(?=(?:19|20)\d{2}\s*:|$)/g;
  for (const match of block[1].matchAll(re)) {
    const labels = match[2]
      .replace(/[–—-]/g, " ")
      .split(/\s*\/\s*|\s*[·•]\s*/)
      .map((part) =>
        part
          .replace(/\s+/g, " ")
          .replace(/([A-Za-z])(\d)/g, "$1 $2")
          .replace(/[.\s]+$/g, "")
          .trim(),
      )
      .filter((part) => part.length > 1 && !/^(o|a|de|da|do)$/i.test(part));
    if (labels.length > 0) awards.push({ year: match[1], labels });
  }
  return awards;
}

function parseTipo(text: string): string | null {
  const nearAlcohol = text.match(
    /gradua[cç][aã]o[^.]{0,40}\b(tinto|branco|ros[eé]|espumante)\b/i,
  );
  const token = nearAlcohol?.[1] ?? text.match(/\b(tinto|branco|ros[eé]|espumante)\b/i)?.[1];
  if (!token) return null;
  if (/^ros/i.test(token)) return "Rosé";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function parseAbout(text: string, name: string): string | null {
  let body = text
    .replace(/PREMIA[CÇ][OÕ]ES:[\s\S]*?(?=\b(?:O|A|Elegante|Imagem|Caracter|Pa[ií]s|Degusta)\b)/i, " ")
    .replace(/Imagem meramente ilustrativa\.[^.]*\./gi, " ")
    .replace(/\bCaracter[ií]sticas\b[\s\S]*/i, " ")
    .replace(name, " ")
    .replace(/\s+/g, " ")
    .trim();
  body = body.split(/\b(?:Degusta[cç][aã]o|Pa[ií]s:|Uva:|Produtor:)\b/i)[0]?.trim() ?? "";
  body = body.replace(/^[\s.\-–—]+/, "").trim();
  if (body.length < 40) return null;
  return sentence(body);
}

function parseProducer(text: string): string | null {
  const match = text.match(
    /Produtor:\s*([\s\S]*?)(?=Imagem meramente|Colheita:|PREMIA|$)/i,
  );
  const raw = match?.[1]?.trim();
  if (!raw || raw.length < 40) return null;
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s+(A direção técnica)/, "\n\n$1")
    .trim();
}

function parseTaste(text: string): { color: string | null; aroma: string | null; palate: string | null } {
  const color = text.match(/\bCor:\s*(.+?)(?=\bAroma:|\bSabor:|\bProdutor:|$)/i)?.[1];
  const aroma = text.match(/\bAroma:\s*(.+?)(?=\bSabor:|\bProdutor:|\bCor:|$)/i)?.[1];
  const palate = text.match(/\bSabor:\s*(.+?)(?=\bProdutor:|\bPa[ií]s:|\bCor:|$)/i)?.[1];
  return { color: sentence(color), aroma: sentence(aroma), palate: sentence(palate) };
}

function stripHarvest(grape: string | null | undefined): { grape: string | null; harvest: string | null } {
  const raw = tidy(grape);
  if (!raw) return { grape: null, harvest: null };
  const harvestMatch = raw.match(/colheita\s+(manual|mec[aâ]nica)/i);
  const harvest = harvestMatch
    ? harvestMatch[1].charAt(0).toUpperCase() + harvestMatch[1].slice(1).toLowerCase()
    : null;
  const cleaned = tidy(raw.replace(/colheita\s+(manual|mec[aâ]nica)/i, ""));
  return { grape: cleaned, harvest };
}

export function buildProductStory(product: StorySource): ProductStory {
  const description = plain(product.description);
  const short = plain(product.short_description);
  const blob = `${short} ${description}`.trim();
  const taste = parseTaste(blob);
  const grape = stripHarvest(product.grape);
  const harvestFromText = blob.match(/colheita:\s*(manual|mec[aâ]nica)/i)?.[1];
  const founded = blob.match(/fundad[ao]s?\s+em\s+(\d{4})/i)?.[1] ?? null;
  const alcohol =
    tidy(product.alcohol_content) ??
    tidy(blob.match(/gradua[cç][aã]o alco[oó]lica:\s*([^.<]+)/i)?.[1] ?? null);
  const parsedTipo = parseTipo(blob);
  const colorLabel = product.color ? COLOR_LABEL[product.color] ?? null : null;

  return {
    about: isNarrative(short) ? sentence(short) : parseAbout(description, product.name),
    tasteColor: sentence(product.visual_notes) ?? taste.color,
    aroma: sentence(product.nose_notes) ?? taste.aroma,
    palate: sentence(product.palate_notes) ?? taste.palate,
    awards: parseAwards(blob),
    producer: parseProducer(description) ?? parseProducer(blob),
    disclaimer: /imagem meramente ilustrativa/i.test(blob)
      ? "Imagem meramente ilustrativa. Consulte a safra disponível em estoque antes da compra."
      : null,
    tipo: tidy(product.wine_type) ?? parsedTipo ?? colorLabel,
    grape: grape.grape,
    harvest: grape.harvest ?? (harvestFromText ? harvestFromText.charAt(0).toUpperCase() + harvestFromText.slice(1).toLowerCase() : null),
    alcohol,
    region: tidy(product.region),
    founded,
    vintageVaries: /safra[^.]{0,140}(alter|disponib|vari|estoque)/i.test(blob),
  };
}

export function packageLine(name: string): string {
  const pack =
    name.match(/(?:pack|kit)\s*(?:de\s*)?(\d+)/i) ?? name.match(/(\d+)\s*garrafas/i);
  if (!pack) return "1 unidade";
  const count = Number(pack[1]);
  if (!Number.isFinite(count) || count < 2) return "1 unidade";
  return `${count} unidades`;
}
