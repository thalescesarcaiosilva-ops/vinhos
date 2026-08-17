import { getSiteUrl } from "./site-url";

/** Identidade pública da loja (SEO, e-mails, schema). Preferir useStoreSettings() para frete/pagamentos. */
export const STORE = {
  name: "Galvao Vinhos",
  legalName: "66.645.637 Ana Clara Sena Galvao",
  cnpj: "66.645.637/0001-43",
  email: "atendimento@galvaovinhos.com.br",
  phone: "(71) 99937-4325",
  phoneDigits: "71999374325",
  address: "Avenida Dom João VI, 342 - Brotas, Salvador - BA, CEP: 40285-001",
  streetAddress: "Avenida Dom João VI, 342",
  addressLocality: "Salvador",
  addressRegion: "BA",
  postalCode: "40285-001",
  description:
    "A Galvao Vinhos é uma loja especializada em vinhos e espumantes selecionados, com curadoria cuidadosa, compra segura e atendimento próximo.",
  get url() {
    return getSiteUrl();
  },
  /** Sem WhatsApp comercial no momento. */
  whatsappNumber: "",
  freeShippingFrom: 300,
  flatShipping: 43.2,
  expressShipping: 43.2,
};
