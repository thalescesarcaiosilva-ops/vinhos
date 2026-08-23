/** Slugs canônicos das páginas institucionais / políticas da loja. */
export const POLICY_SLUGS = {
  terms: "termos-e-condicoes-de-uso",
  privacy: "politica-de-privacidade",
  returns: "politica-de-devolucao-e-reembolso",
  shipping: "politica-de-frete",
  payment: "formas-de-pagamento",
  legal: "aviso-legal",
} as const;

export type PolicySlug = (typeof POLICY_SLUGS)[keyof typeof POLICY_SLUGS];

/** URL pública preferida (GMC / checkout / footer). */
export function policyUrl(slug: string): `/politicas/${string}` {
  return `/politicas/${slug}`;
}

/** Links exibidos no checkout antes do pagamento. */
export const CHECKOUT_POLICY_LINKS: { slug: PolicySlug; label: string }[] = [
  { slug: POLICY_SLUGS.terms, label: "Termos e Condições" },
  { slug: POLICY_SLUGS.privacy, label: "Política de Privacidade" },
  { slug: POLICY_SLUGS.returns, label: "Trocas e Devoluções" },
  { slug: POLICY_SLUGS.shipping, label: "Política de Frete" },
];
