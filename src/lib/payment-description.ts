/**
 * Nome padronizado enviado APENAS na requisição de pagamento (gateway).
 *
 * Nunca importar este módulo em rotas/páginas da loja, feeds, sitemap,
 * schema.org ou qualquer resposta visível ao cliente.
 */

const BAND_0_99 = [
  "Camiseta Masculina Básica Algodão Premium",
  "Camiseta Masculina Essential Gola Redonda",
  "Camiseta Masculina Oversized Street",
  "Camiseta Masculina Slim Fit Algodão",
  "Camiseta Masculina Premium Lisa",
] as const;

const BAND_100_199 = [
  "Camisa Masculina Social Slim Fit Premium",
  "Camisa Masculina Linho Manga Longa",
  "Camisa Masculina Oxford Premium",
  "Camisa Masculina Casual Texturizada",
  "Camisa Masculina Social Algodão Premium",
] as const;

const BAND_200_299 = [
  "Calça Jeans Masculina Slim Fit Premium",
  "Short Masculino Sarja Premium",
  "Tênis Masculino Casual Urban",
  "Calça Masculina Alfaiataria Slim",
  "Tênis Masculino Casual Sport",
] as const;

const BAND_300_399 = [
  "Tênis Masculino Casual Premium",
  "Calça Jeans Masculina Premium Straight",
  "Tênis Masculino Streetwear Urban",
  "Calça Masculina Alfaiataria Premium",
  "Conjunto Masculino Camisa e Short Premium",
] as const;

const BAND_400_499 = [
  "Tênis Masculino Premium Couro Casual",
  "Jaqueta Masculina Premium Urban",
  "Tênis Masculino Sport Performance",
  "Conjunto Masculino Premium Calça e Camisa",
  "Jaqueta Masculina Bomber Premium",
] as const;

const BAND_500_599 = [
  "Tênis Masculino Premium Couro Legítimo",
  "Jaqueta Masculina Couro Premium",
  "Tênis Masculino Performance Pro",
  "Conjunto Masculino Alfaiataria Premium",
  "Tênis Masculino Urban Luxury",
] as const;

const BAND_600_699 = [
  "Tênis Masculino Premium Couro Heritage",
  "Jaqueta Masculina Couro Executive",
  "Tênis Masculino Performance Elite",
  "Conjunto Masculino Alfaiataria Executive",
  "Tênis Masculino Urban Premium Edition",
] as const;

/** Faixa 700–799,99 e também 800–899,99 (mesmos nomes). */
const BAND_700_899 = [
  "Tênis Masculino Premium Couro Luxury",
  "Jaqueta Masculina Couro Premium Executive",
] as const;

const BAND_900_PLUS = [
  "Tênis Masculino Couro Premium Luxury",
  "Jaqueta Masculina Couro Legítimo Premium",
  "Tênis Masculino Luxury Edition",
  "Conjunto Masculino Alfaiataria Luxury",
] as const;

type NameBand = readonly string[];

function bandForTotal(totalReais: number): NameBand {
  const t = Number.isFinite(totalReais) ? Math.max(0, totalReais) : 0;
  if (t < 100) return BAND_0_99;
  if (t < 200) return BAND_100_199;
  if (t < 300) return BAND_200_299;
  if (t < 400) return BAND_300_399;
  if (t < 500) return BAND_400_499;
  if (t < 600) return BAND_500_599;
  if (t < 700) return BAND_600_699;
  if (t < 900) return BAND_700_899;
  return BAND_900_PLUS;
}

/** Hash estável (não criptográfico) — mesmo order_id → mesmo índice. */
function stableHash(orderId: string): number {
  let h = 2166136261;
  for (let i = 0; i < orderId.length; i++) {
    h ^= orderId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Nome padronizado para o campo `description` (e títulos de item) da cobrança.
 * Baseado no total do pedido (itens + frete − descontos) e no order_id.
 */
export function paymentDescription(orderId: string, totalReais: number): string {
  const band = bandForTotal(totalReais);
  const index = stableHash(orderId) % band.length;
  return band[index]!;
}
