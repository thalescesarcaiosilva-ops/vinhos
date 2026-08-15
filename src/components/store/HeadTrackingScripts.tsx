import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useStoreSettings } from "@/lib/store-settings";
import {
  escapeJsString,
  firstGoogleLoaderId,
  normalizeTrackingSettings,
  uniqueGoogleConfigIds,
} from "@/lib/analytics";

const MARKER = "data-galvao-analytics";

/**
 * Carrega gtag.js + Clarity apenas nas páginas públicas da vitrine.
 * IDs vêm de store_settings (admin) — nunca de env. Admin não recebe esses scripts.
 */
export function HeadTrackingScripts() {
  const { data: settings } = useStoreSettings();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");
  const tracking = settings?.tracking ? normalizeTrackingSettings(settings.tracking) : null;
  const trackingKey = tracking
    ? [
        tracking.googleTagId,
        tracking.googleAnalyticsId,
        tracking.googleAdsId,
        tracking.microsoftClarityId,
      ].join("|")
    : "";

  useEffect(() => {
    if (isAdmin || !tracking) return;

    const googleIds = uniqueGoogleConfigIds(tracking);
    const loaderId = firstGoogleLoaderId(tracking);
    const clarityId = tracking.microsoftClarityId;

    const added: HTMLElement[] = [];

    const append = (el: HTMLElement) => {
      el.setAttribute(MARKER, "1");
      document.head.appendChild(el);
      added.push(el);
    };

    if (loaderId && googleIds.length > 0) {
      const external = document.createElement("script");
      external.async = true;
      external.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}`;
      append(external);

      const boot = document.createElement("script");
      boot.textContent = [
        "window.dataLayer=window.dataLayer||[];",
        "function gtag(){dataLayer.push(arguments);}",
        "window.gtag=gtag;",
        "gtag('js',new Date());",
        ...googleIds.map((id) => `gtag('config',${escapeJsString(id)});`),
      ].join("");
      append(boot);
    }

    if (clarityId) {
      const clarity = document.createElement("script");
      clarity.textContent = [
        "(function(c,l,a,r,i,t,y){",
        "c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};",
        "t=l.createElement(r);t.async=1;",
        `t.src="https://www.clarity.ms/tag/"+${escapeJsString(clarityId)};`,
        "y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);",
        `})(window,document,"clarity","script",${escapeJsString(clarityId)});`,
      ].join("");
      append(clarity);
    }

    return () => {
      for (const el of added) el.remove();
      document.head.querySelectorAll(`[${MARKER}]`).forEach((n) => n.remove());
    };
    // trackingKey cobre mudanças relevantes dos IDs; tracking é derivado na mesma render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, trackingKey]);

  return null;
}
