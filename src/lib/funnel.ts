import { supabase } from "@/integrations/supabase/client";

/** Etapas da visita. Sem nome, e-mail ou telefone. */
export const FUNNEL_STEPS = [
  "cart",
  "checkout",
  "personal",
  "shipping",
  "payment",
  "order",
  "paid",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

const SID_KEY = "galvao_funnel_sid";
const recorded = new Set<string>();

function visitId(): string | null {
  try {
    const existing = sessionStorage.getItem(SID_KEY);
    if (existing && existing.length >= 16 && existing.length <= 80) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function remember(key: string) {
  try {
    sessionStorage.setItem(`galvao_funnel_${key}`, "1");
  } catch {
    /* a visita ainda conta nesta aba */
  }
}

function alreadyMarked(key: string) {
  if (recorded.has(key)) return true;
  try {
    if (sessionStorage.getItem(`galvao_funnel_${key}`) === "1") {
      recorded.add(key);
      return true;
    }
  } catch {
    /* segue o insert */
  }
  return false;
}

/** Marca a etapa uma vez por visita. Pedido gerado e pago usam o id do pedido. */
export function recordFunnelStep(step: FunnelStep, orderId?: string) {
  if (typeof window === "undefined") return;
  const key = orderId ? `${step}:${orderId}` : step;
  if (alreadyMarked(key)) return;
  const sessionId = visitId();
  if (!sessionId) return;
  recorded.add(key);

  void supabase
    .from("store_funnel_events")
    .insert({
      session_id: sessionId,
      step,
      order_id: orderId ?? null,
    })
    .then(({ error }) => {
      if (!error || error.code === "23505") {
        remember(key);
        return;
      }
      recorded.delete(key);
    });
}
