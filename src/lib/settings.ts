import { getSiteUrl } from "./site-url";

/** Identidade pública da loja (SEO, e-mails, schema). Preferir useStoreSettings() para frete/pagamentos. */
export const STORE = {
  name: "Galvao Vinhos",
  legalName: "66.645.637 Ana Clara Sena Galvao",
  cnpj: "66.645.637/0001-43",
  email: "atendimento@galvaovinhos.com.br",
  phone: "(31) 97554-9668",
  phoneDigits: "31975549668",
  address: "Avenida Dom João VI, 342 - Brotas, Salvador - BA, CEP: 40285-001",
  streetAddress: "Avenida Dom João VI, 342",
  addressLocality: "Salvador",
  addressRegion: "BA",
  postalCode: "40285-001",
  description:
    "A Galvao Vinhos é uma loja especializada em vinhos e espumantes selecionados, com curadoria cuidadosa, compra segura e atendimento próximo em Salvador — BA.",
  get url() {
    return getSiteUrl();
  },
  /** Mesmo número da loja (WhatsApp / tel). */
  whatsappNumber: "5531975549668",
  whatsappDisplay: "(31) 97554-9668",
  freeShippingFrom: 200,
  flatShipping: 15.2,
  expressShipping: 15.2,
};
