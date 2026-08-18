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
 * Carrega Tag Manager, gtag.js e Clarity apenas nas páginas públicas da vitrine.
 * IDs vêm de store_settings (admin) — nunca de env. Admin não recebe esses scripts.
 */
export function HeadTrackingScripts() {
  const { data: settings } = useStoreSettings();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname.startsWith("/admin");
  const tracking = settings?.tracking ? normalizeTrackingSettings(settings.tracking) : null;
  const trackingKey = tracking
    ? [
        tracking.googleTagManagerId,
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
    const gtmId = tracking.googleTagManagerId;
    const clarityId = tracking.microsoftClarityId;

    const added: HTMLElement[] = [];

    const appendHead = (el: HTMLElement) => {
      el.setAttribute(MARKER, "1");
      document.head.appendChild(el);
      added.push(el);
    };

    if (gtmId) {
      const gtm = document.createElement("script");
      gtm.textContent = [
        "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':",
        "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],",
        "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=",
        "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);",
        `})(window,document,'script','dataLayer',${escapeJsString(gtmId)});`,
      ].join("");
      appendHead(gtm);

      const noscript = document.createElement("noscript");
      noscript.setAttribute(MARKER, "1");
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`;
      iframe.height = "0";
      iframe.width = "0";
      iframe.style.display = "none";
      iframe.style.visibility = "hidden";
      iframe.title = "Google Tag Manager";
      noscript.appendChild(iframe);
      document.body.insertBefore(noscript, document.body.firstChild);
      added.push(noscript);
    }

    if (loaderId && googleIds.length > 0) {
      const external = document.createElement("script");
      external.async = true;
      external.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}`;
      appendHead(external);

      const boot = document.createElement("script");
      boot.textContent = [
        "window.dataLayer=window.dataLayer||[];",
        "function gtag(){dataLayer.push(arguments);}",
        "window.gtag=gtag;",
        "gtag('js',new Date());",
        ...googleIds.map((id) => `gtag('config',${escapeJsString(id)});`),
      ].join("");
      appendHead(boot);
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
      appendHead(clarity);
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
