import { countries } from "./countries";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const labelMap = new Map<string, string>();
const slugMap = new Map<string, string>();
for (const c of countries) {
  labelMap.set(norm(c.label), c.cc);
  slugMap.set(c.slug, c.cc);
}

// extras / aliases commonly used in CMS
const aliases: Record<string, string> = {
  eua: "us", "estados unidos": "us", usa: "us",
  inglaterra: "gb", "reino unido": "gb",
  romenia: "ro", peru: "pe",
};
for (const [k, v] of Object.entries(aliases)) labelMap.set(norm(k), v);

/** Returns the ISO country code (e.g. "br") for a country name/slug, or null. */
export function ccForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const key = norm(country);
  return labelMap.get(key) ?? slugMap.get(country) ?? null;
}

/** URL same-origin da bandeira; o Vercel faz o proxy/cache do arquivo. */
export function flagImgUrl(cc: string, size: 40 | 80 | 160 = 80): string {
  return `/flags/w${size}/${cc}.png`;
}

/** @deprecated Use flagImgUrl — mantido para compatibilidade */
export function flagUrlFor(country: string | null | undefined, size: 40 | 80 | 160 = 80): string | null {
  const cc = ccForCountry(country);
  return cc ? flagImgUrl(cc, size) : null;
}
