import { STORE } from "@/lib/settings";
import { absoluteSiteUrl, getSiteUrl } from "@/lib/site-url";
import { truncateAtWord } from "@/lib/product-seo";

export const DEFAULT_OG_IMAGE = absoluteSiteUrl("/assets/favicon.png");

export const SEO = {
  homeTitle: `${STORE.name} — Vinhos e espumantes selecionados`,
  homeDescription:
    "Compre vinhos tintos, brancos, espumantes, rosés e kits na Galvao Vinhos. Curadoria cuidadosa, frete para todo o Brasil e atendimento em Salvador — BA.",
  storeDescription: STORE.description,
};

type PageMetaOptions = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "product" | "article";
  noindex?: boolean;
};

/** Meta tags padrão (title, description, Open Graph, Twitter) + canonical opcional. */
export function pageMeta({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  noindex = false,
}: PageMetaOptions) {
  const url = path ? absoluteSiteUrl(path) : undefined;
  const meta = [
    { title },
    { name: "description", content: description },
    ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:site_name", content: STORE.name },
    { property: "og:locale", content: "pt_BR" },
    ...(url ? [{ property: "og:url", content: url }] : []),
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(image ? [{ name: "twitter:image", content: image }] : []),
  ];
  return {
    meta,
    links: url ? [{ rel: "canonical", href: url }] : [],
  };
}

/** Organization / seller usado em Offer de produto. */
export function buildSellerOrganization() {
  return {
    "@type": "Organization",
    name: STORE.name,
    legalName: STORE.legalName,
    url: getSiteUrl(),
    taxID: STORE.cnpj,
    email: STORE.email,
    telephone: STORE.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: STORE.streetAddress,
      addressLocality: STORE.addressLocality,
      addressRegion: STORE.addressRegion,
      postalCode: STORE.postalCode,
      addressCountry: "BR",
    },
  };
}

/** Schema.org da loja (WineStore) — identidade Galvao Vinhos. */
export function buildStoreSchema() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": ["Store", "WineStore"],
    "@id": `${siteUrl.replace(/\/+$/, "")}/#store`,
    name: STORE.name,
    legalName: STORE.legalName,
    alternateName: "Galvão Vinhos",
    url: siteUrl,
    taxID: STORE.cnpj,
    vatID: STORE.cnpj,
    email: STORE.email,
    telephone: STORE.phone,
    description: STORE.description,
    image: DEFAULT_OG_IMAGE,
    logo: DEFAULT_OG_IMAGE,
    currenciesAccepted: "BRL",
    paymentAccepted: "Credit Card, PIX",
    priceRange: "$$",
    areaServed: {
      "@type": "Country",
      name: "BR",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: STORE.streetAddress,
      addressLocality: STORE.addressLocality,
      addressRegion: STORE.addressRegion,
      postalCode: STORE.postalCode,
      addressCountry: "BR",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:00",
        closes: "18:00",
      },
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: STORE.phone,
      email: STORE.email,
      availableLanguage: ["Portuguese"],
      areaServed: "BR",
    },
  };
}

/** Meta description a partir de texto livre (páginas institucionais). */
export function descriptionFromContent(content: string | null | undefined, fallback: string): string {
  const plain = (content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length < 40) return fallback;
  return truncateAtWord(plain, 160);
}
