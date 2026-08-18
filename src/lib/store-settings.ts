import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTrackingSettings } from "@/lib/analytics";
import { STORE } from "@/lib/settings";
import {
  DEFAULT_INSTALLMENT_RATES,
  mergeInstallmentRates,
  type InstallmentRates,
} from "@/lib/installments";

export type { InstallmentRates, InstallmentPlanItem } from "@/lib/installments";
export { DEFAULT_INSTALLMENT_RATES, installmentPlan, installmentRateFor } from "@/lib/installments";

export type ShippingMethod = {
  id: string;
  label: string;
  price: number;
  etaMinDays: number;
  etaMaxDays: number;
  enabled: boolean;
};

export type ShippingRegion = {
  id: string;
  label: string;
  ufs: string[];
  priceFactor: number; // multiplier (1 = base)
  extraDays: number;
  freeShippingFrom: number | null; // null = use global threshold
};

export type ShippingSettings = {
  freeShippingFrom: number;
  // legacy (kept for back-compat with older saved settings)
  flatShipping: number;
  expressShipping: number;
  /** Separação/embalagem após o pagamento (dias úteis). */
  prepMinDays: number;
  prepMaxDays: number;
  methods: ShippingMethod[];
  regions: ShippingRegion[];
};

/** Frete da política: grátis ≥ R$ 300; abaixo R$ 43,20; transporte 6–9 dias úteis. */
export const POLICY_SHIPPING_METHOD: ShippingMethod = {
  id: "entrega-padrao",
  label: "Entrega",
  price: STORE.flatShipping,
  etaMinDays: 6,
  etaMaxDays: 9,
  enabled: true,
};

/** Taxa total (%) cobrada no valor do pedido para aquela quantidade de parcelas. */
export type PaymentSettings = {
  pixEnabled: boolean;
  pixDiscount: number; // % off on PIX
  boletoEnabled: boolean;
  cardEnabled: boolean;
  maxInstallments: number;
  minInstallment: number;
  interestFreeUpTo: number; // installments without interest
  /** @deprecated Preferir installmentRates (taxa total por parcela). */
  monthlyInterest: number;
  /** Taxa total em %: 2x → 23, 3x → 23.96, etc. */
  installmentRates: InstallmentRates;
};

export type ColorSettings = {
  primary: string;
  accent: string;
  buy: string;
  sectionTitle: string;
  productName: string;
  productPrice: string;
};

export type BrandSettings = {
  logoUrl: string;
  logoMaxHeight: number; // px
};

export type FooterLink = { label: string; href: string };
export type SecurityBadge = {
  id: string;
  imageUrl: string;
  href: string;
  alt: string;
  height: number;
};
export type InstitutionalPage = { id: string; label: string; slug: string; content: string };

export type FooterSettings = {
  logoUrl: string;
  logoMaxHeight: number;
  aboutText: string;
  address: string;
  phone: string;
  email: string;
  instagramUrl: string;
  facebookUrl: string;
  copyrightText: string;
  categoriesTitle: string;
  categories: FooterLink[];
  institutionalTitle: string;
  institutional: InstitutionalPage[];
  newsletterTitle: string;
  securityBadgesTitle: string;
  securityBadges: SecurityBadge[];
};

export type TrackingSettings = {
  /** Google Tag — GT-… ou G-… */
  googleTagId: string;
  /** Google Analytics GA4 — G-… */
  googleAnalyticsId: string;
  /** Google Ads — AW-… */
  googleAdsId: string;
  /** Conversão Ads — send_to AW-…/label */
  googleAdsConversionSendTo: string;
  /** Google Tag Manager — GTM-… */
  googleTagManagerId: string;
  /** Microsoft Clarity — ID do projeto (ou snippet colado) */
  microsoftClarityId: string;
  /**
   * @deprecated Campo legado de HTML livre. Não é mais injetado;
   * mantido só para não apagar dados antigos no JSON do banco.
   */
  headScripts?: string;
};

export type StoreSettingsData = {
  shipping: ShippingSettings;
  payments: PaymentSettings;
  colors: ColorSettings;
  brand: BrandSettings;
  footer: FooterSettings;
  tracking: TrackingSettings;
};

export const DEFAULT_SETTINGS: StoreSettingsData = {
  shipping: {
    freeShippingFrom: STORE.freeShippingFrom,
    flatShipping: STORE.flatShipping,
    expressShipping: STORE.expressShipping,
    prepMinDays: 1,
    prepMaxDays: 2,
    methods: [{ ...POLICY_SHIPPING_METHOD }],
    regions: [],
  },
  payments: {
    pixEnabled: true,
    pixDiscount: 0,
    boletoEnabled: false,
    cardEnabled: true,
    maxInstallments: 6,
    minInstallment: 25,
    interestFreeUpTo: 1,
    monthlyInterest: 0,
    installmentRates: { ...DEFAULT_INSTALLMENT_RATES },
  },
  colors: {
    primary: "#5a1a1f",
    accent: "#c9a86a",
    buy: "#2f9e4f",
    sectionTitle: "#5a1a1f",
    productName: "#1a1a1a",
    productPrice: "#5a1a1f",
  },
  brand: {
    logoUrl: "",
    logoMaxHeight: 48,
  },
  footer: {
    logoUrl: "",
    logoMaxHeight: 56,
    aboutText: STORE.description,
    address: STORE.address,
    phone: STORE.phone,
    email: STORE.email,
    instagramUrl: "",
    facebookUrl: "",
    copyrightText: `© {year} ${STORE.name} · Todos os direitos reservados`,
    categoriesTitle: "Categorias",
    categories: [],
    institutionalTitle: "Institucional",
    institutional: [],
    newsletterTitle: "Newsletter",
    securityBadgesTitle: "Segurança",
    securityBadges: [],
  },
  tracking: {
    googleTagId: "",
    googleAnalyticsId: "",
    googleAdsId: "",
    googleAdsConversionSendTo: "",
    googleTagManagerId: "",
    microsoftClarityId: "",
    headScripts: "",
  },
};

function merge(data: any): StoreSettingsData {
  const rawShip = data?.shipping ?? {};
  const ship: ShippingSettings = {
    ...DEFAULT_SETTINGS.shipping,
    ...rawShip,
    prepMinDays: Number(rawShip.prepMinDays) >= 0 ? Number(rawShip.prepMinDays) : DEFAULT_SETTINGS.shipping.prepMinDays,
    prepMaxDays: Number(rawShip.prepMaxDays) >= 0 ? Number(rawShip.prepMaxDays) : DEFAULT_SETTINGS.shipping.prepMaxDays,
  };
  ship.methods =
    Array.isArray(rawShip.methods) && rawShip.methods.length > 0
      ? rawShip.methods
      : DEFAULT_SETTINGS.shipping.methods.map((m) => ({ ...m }));
  ship.regions = Array.isArray(rawShip.regions) ? rawShip.regions : [];
  const rawFooter = data?.footer ?? {};
  const footer: FooterSettings = { ...DEFAULT_SETTINGS.footer, ...rawFooter };
  footer.categories = Array.isArray(rawFooter.categories) ? rawFooter.categories : [];
  footer.institutional = Array.isArray(rawFooter.institutional) ? rawFooter.institutional : [];
  footer.securityBadges = Array.isArray(rawFooter.securityBadges) ? rawFooter.securityBadges : [];
  if (footer.categoriesTitle.trim() === "Área do Cliente") {
    footer.categoriesTitle = DEFAULT_SETTINGS.footer.categoriesTitle;
  }
  return {
    shipping: ship,
    payments: mergePaymentSettings(data?.payments),
    colors: { ...DEFAULT_SETTINGS.colors, ...(data?.colors ?? {}) },
    brand: { ...DEFAULT_SETTINGS.brand, ...(data?.brand ?? {}) },
    footer,
    tracking: normalizeTrackingSettings({
      ...DEFAULT_SETTINGS.tracking,
      ...(data?.tracking ?? {}),
    }),
  };
}

export const STORE_SETTINGS_QUERY_KEY = ["store-settings"] as const;

export async function fetchStoreSettings(): Promise<StoreSettingsData> {
  const { data } = await supabase
    .from("store_settings")
    .select("data")
    .eq("id", "singleton")
    .maybeSingle();
  return merge((data as any)?.data);
}

/** Hook da loja: sem placeholder fictício — só renderiza quando houver dado real (ou após loader SSR). */
export function useStoreSettings() {
  return useQuery({
    queryKey: STORE_SETTINGS_QUERY_KEY,
    queryFn: fetchStoreSettings,
    staleTime: 5 * 60_000,
  });
}

export async function saveStoreSettings(next: StoreSettingsData) {
  const payload: StoreSettingsData = {
    ...next,
    tracking: normalizeTrackingSettings(next.tracking),
  };
  const { error } = await supabase
    .from("store_settings")
    .upsert({ id: "singleton", data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function mergePaymentSettings(raw?: Partial<PaymentSettings> | null): PaymentSettings {
  return {
    ...DEFAULT_SETTINGS.payments,
    ...(raw ?? {}),
    installmentRates: mergeInstallmentRates(raw?.installmentRates),
  };
}
