import { useEffect, useState } from "react";

export type CookieConsent = "accepted" | "rejected";

const STORAGE_KEY = "galvao_cookie_consent";
const CHANGE_EVENT = "galvao:cookie-consent";

function isConsent(value: string | null): value is CookieConsent {
  return value === "accepted" || value === "rejected";
}

/** Lê a escolha salva (null = ainda não respondeu). SSR sempre null. */
export function readCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isConsent(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeCookieConsent(value: CookieConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* modo privado / storage bloqueado */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

export function subscribeCookieConsent(
  onChange: (value: CookieConsent | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const notify = () => onChange(readCookieConsent());
  const onCustom = () => notify();
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };

  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Hook: escolha atual + se já leu o storage no cliente. */
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(readCookieConsent());
    setReady(true);
    return subscribeCookieConsent(setConsent);
  }, []);

  return {
    consent,
    ready,
    accept: () => writeCookieConsent("accepted"),
    reject: () => writeCookieConsent("rejected"),
  };
}
