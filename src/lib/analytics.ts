/** Shape mínima das configs de tracking (evita import circular com store-settings). */
export type TrackingIdsInput = {
  googleTagId?: string | null;
  googleAnalyticsId?: string | null;
  googleAdsId?: string | null;
  googleAdsConversionSendTo?: string | null;
  googleTagManagerId?: string | null;
  microsoftClarityId?: string | null;
  headScripts?: string | null;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

/** Escapa string para uso seguro em JS inline (inclui aspas). */
export function escapeJsString(value: string): string {
  return JSON.stringify(value);
}

/** Extrai o ID do Clarity a partir do ID puro ou do snippet/HTML colado. */
export function normalizeClarityId(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";

  const fromUrl = t.match(/clarity\.ms\/tag\/([A-Za-z0-9]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];

  const fromSnippet = t.match(/["']script["']\s*,\s*["']([A-Za-z0-9]+)["']/i);
  if (fromSnippet?.[1]) return fromSnippet[1];

  if (/^[A-Za-z0-9]{5,32}$/.test(t)) return t;

  const loose = t.match(/\b([A-Za-z0-9]{8,20})\b/);
  return loose?.[1] ?? "";
}

/** Normaliza IDs Google (G-… / GT-… / AW-… / GTM-…). */
export function normalizeGoogleId(
  raw: string | null | undefined,
  allowed: ReadonlyArray<"G" | "GT" | "AW" | "GTM">,
): string {
  const t = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  for (const prefix of allowed) {
    if (prefix === "GTM" && /^GTM-[A-Z0-9]+$/.test(t)) return t;
    if (prefix === "GT" && /^GT-[A-Z0-9]+$/.test(t)) return t;
    if (prefix === "G" && /^G-[A-Z0-9]+$/.test(t)) return t;
    if (prefix === "AW" && /^AW-[A-Z0-9]+$/.test(t)) return t;
  }
  return "";
}

/** Normaliza send_to de conversão Ads: AW-…/label */
export function normalizeAdsSendTo(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().replace(/\s+/g, "");
  if (!t) return "";
  if (/^AW-[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/.test(t)) return t;
  return "";
}

export function normalizeTrackingSettings(raw: TrackingIdsInput): {
  googleTagId: string;
  googleAnalyticsId: string;
  googleAdsId: string;
  googleAdsConversionSendTo: string;
  googleTagManagerId: string;
  microsoftClarityId: string;
  headScripts: string;
} {
  return {
    googleTagId: normalizeGoogleId(raw.googleTagId, ["GT", "G"]),
    googleAnalyticsId: normalizeGoogleId(raw.googleAnalyticsId, ["G"]),
    googleAdsId: normalizeGoogleId(raw.googleAdsId, ["AW"]),
    googleAdsConversionSendTo: normalizeAdsSendTo(raw.googleAdsConversionSendTo),
    googleTagManagerId: normalizeGoogleId(raw.googleTagManagerId, ["GTM"]),
    microsoftClarityId: normalizeClarityId(raw.microsoftClarityId),
    headScripts: typeof raw.headScripts === "string" ? raw.headScripts : "",
  };
}

/** IDs únicos para gtag('config', …) — Tag, Analytics e Ads. */
export function uniqueGoogleConfigIds(t: TrackingIdsInput): string[] {
  const n = normalizeTrackingSettings(t);
  const ids = [n.googleTagId, n.googleAnalyticsId, n.googleAdsId].filter(Boolean);
  return [...new Set(ids)];
}

export function firstGoogleLoaderId(t: TrackingIdsInput): string | null {
  const ids = uniqueGoogleConfigIds(t);
  return ids[0] ?? null;
}

export type TrackingActiveItem = {
  key: string;
  label: string;
  active: boolean;
  value?: string;
};

export function trackingActiveItems(t: TrackingIdsInput): TrackingActiveItem[] {
  const n = normalizeTrackingSettings(t);
  return [
    { key: "gtm", label: "Google Tag Manager", active: Boolean(n.googleTagManagerId), value: n.googleTagManagerId || undefined },
    { key: "tag", label: "Google Tag", active: Boolean(n.googleTagId), value: n.googleTagId || undefined },
    { key: "ga", label: "Google Analytics (GA4)", active: Boolean(n.googleAnalyticsId), value: n.googleAnalyticsId || undefined },
    { key: "ads", label: "Google Ads", active: Boolean(n.googleAdsId), value: n.googleAdsId || undefined },
    {
      key: "conv",
      label: "Conversão Google Ads",
      active: Boolean(n.googleAdsConversionSendTo),
      value: n.googleAdsConversionSendTo || undefined,
    },
    { key: "clarity", label: "Microsoft Clarity", active: Boolean(n.microsoftClarityId), value: n.microsoftClarityId || undefined },
  ];
}

const firedConversionIds = new Set<string>();

/**
 * Dispara conversão do Google Ads na página de obrigado.
 * Evita duplicata via sessionStorage + Set em memória; retenta gtag até ~10s.
 */
export function fireGoogleAdsConversion(opts: {
  sendTo: string;
  value: number;
  transactionId: string;
  currency?: string;
}): void {
  const sendTo = normalizeAdsSendTo(opts.sendTo);
  const transactionId = String(opts.transactionId ?? "").trim();
  if (!sendTo || !transactionId) return;

  const storageKey = `galvao_gads_conv_${transactionId}`;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey)) return;
  } catch {
    /* private mode */
  }
  if (firedConversionIds.has(transactionId)) return;

  const value = Number.isFinite(opts.value) ? opts.value : 0;
  const currency = opts.currency || "BRL";
  const maxAttempts = 20;
  const intervalMs = 500;
  let attempts = 0;

  const tryFire = () => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: sendTo,
        value,
        currency,
        transaction_id: transactionId,
      });
      firedConversionIds.add(transactionId);
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        /* noop */
      }
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      window.setTimeout(tryFire, intervalMs);
    }
  };

  tryFire();
}
