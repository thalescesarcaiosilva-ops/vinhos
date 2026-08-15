import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTrackingSettings } from "@/lib/analytics";
import { STORE } from "@/lib/settings";

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
  methods: ShippingMethod[];
  regions: ShippingRegion[];
};

export type PaymentSettings = {
  pixEnabled: boolean;
  pixDiscount: number; // % off on PIX
  boletoEnabled: boolean;
  cardEnabled: boolean;
  maxInstallments: number;
  minInstallment: number;
  interestFreeUpTo: number; // installments without interest
  monthlyInterest: number; // % per month after threshold
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
    // Só usado no merge admin/API incompleta — NUNCA como placeholder de UI.
    freeShippingFrom: STORE.freeShippingFrom,
    flatShipping: STORE.flatShipping,
    expressShipping: STORE.expressShipping,
    methods: [],
    regions: [],
  },
  payments: {
    pixEnabled: true,
    pixDiscount: 0,
    boletoEnabled: false,
    cardEnabled: true,
    maxInstallments: 12,
    minInstallment: 25,
    interestFreeUpTo: 1,
    monthlyInterest: 0,
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
    microsoftClarityId: "",
    headScripts: "",
  },
};

function merge(data: any): StoreSettingsData {
  const rawShip = data?.shipping ?? {};
  const ship: ShippingSettings = { ...DEFAULT_SETTINGS.shipping, ...rawShip };
  ship.methods = Array.isArray(rawShip.methods) ? rawShip.methods : [];
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
    payments: { ...DEFAULT_SETTINGS.payments, ...(data?.payments ?? {}) },
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

/** Compute installment plan from settings + card total */
export function installmentPlan(cardPrice: number, p: PaymentSettings) {
  const out: { n: number; value: number; total: number; hasInterest: boolean }[] = [];
  for (let n = 1; n <= p.maxInstallments; n++) {
    const hasInterest = n > p.interestFreeUpTo && p.monthlyInterest > 0;
    const total = hasInterest ? cardPrice * Math.pow(1 + p.monthlyInterest / 100, n) : cardPrice;
    const value = total / n;
    if (value < p.minInstallment && n > 1) break;
    out.push({ n, value, total, hasInterest });
  }
  return out;
}
