import type { Track7Event, Track7TrackingData, Track7TrackingResult } from "@/lib/track7";
import { sortTrack7EventsNewestFirst } from "@/lib/track7";

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

const BROKEN_HOSTS = ["api.track7.com.br", "api.track7.app"];
const OFFICIAL_BASE = "https://track7.app/api/v1";

export function track7ApiBase(): string {
  const raw = (serverEnv("TRACK7_API_URL") || OFFICIAL_BASE).trim().replace(/\/+$/, "");
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (BROKEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return OFFICIAL_BASE;
  } catch {
    return OFFICIAL_BASE;
  }
  return raw || OFFICIAL_BASE;
}

export function track7ApiKey(): string | null {
  return serverEnv("TRACK7_API_KEY")?.trim() || null;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** Código Correios típico (ex.: PQ2925503904BR) ou similar. */
export function looksLikeTrackingCode(value: string): boolean {
  const v = value.trim().toUpperCase();
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(v) || /^[A-Z0-9]{8,24}$/.test(v);
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function normalizeEvent(row: Record<string, unknown>): Track7Event | null {
  const status = pickString(row.status, row.title, row.event, row.name);
  const description = pickString(row.description, row.details, row.detail, row.message, status);
  const date = pickString(row.date, row.datetime, row.date_time, row.created_at, row.timestamp);
  const location = pickString(row.location, row.local, row.city, row.place, row.unidade);
  if (!status && !description && !date) return null;
  return {
    date,
    location,
    status: status || description,
    description: description || status,
  };
}

export function normalizeTrackingPayload(raw: unknown): Track7TrackingData | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data = (
    root.data && typeof root.data === "object" ? root.data : root
  ) as Record<string, unknown>;

  const eventsRaw = Array.isArray(data.events)
    ? data.events
    : Array.isArray(data.history)
      ? data.history
      : Array.isArray(data.movements)
        ? data.movements
        : Array.isArray(root.events)
          ? root.events
          : [];

  // Mais recente primeiro (igual ao histórico da Track7).
  const events = sortTrack7EventsNewestFirst(eventsRaw
    .map((e) => (e && typeof e === "object" ? normalizeEvent(e as Record<string, unknown>) : null))
    .filter(Boolean) as Track7Event[]);

  const tracking_code = pickString(
    data.tracking_code,
    data.trackingCode,
    data.code,
    root.tracking_code,
  );
  const transaction_id = pickString(
    data.transaction_id,
    data.transactionId,
    data.order_id,
    data.orderId,
    root.transaction_id,
  );
  const status = pickString(data.status, data.current_status, data.currentStatus, root.status);
  const current_status = pickString(
    data.current_status,
    data.currentStatus,
    data.status_label,
    data.statusLabel,
    status,
  );

  if (!tracking_code && !transaction_id && events.length === 0) return null;

  return {
    transaction_id,
    tracking_code,
    status,
    current_status: current_status || status || "Aguardando atualização",
    events,
  };
}

export async function track7Get(path: string): Promise<Track7TrackingResult> {
  const apiKey = track7ApiKey();
  if (!apiKey) {
    return { ok: false, error: "Rastreio indisponível no momento. Tente mais tarde.", status: 503 };
  }

  const url = `${track7ApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "O serviço de rastreio demorou para responder. Tente novamente em instantes."
        : "Não foi possível conectar ao serviço de rastreio.",
      status: 502,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401) {
    return { ok: false, error: "Falha na autenticação do rastreio. Confira TRACK7_API_KEY.", status: 401 };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "Pedido não encontrado. Confira o código ou aguarde a postagem.",
      status: 404,
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: "Muitas consultas em pouco tempo. Tente novamente em instantes.",
      status: 429,
    };
  }
  if (!res.ok) {
    return { ok: false, error: `Erro Track7 (${res.status}).`, status: res.status };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "Resposta inválida da Track7.", status: 502 };
  }

  const data = normalizeTrackingPayload(json);
  if (!data) {
    return { ok: false, error: "Não encontramos dados de rastreio para este código.", status: 404 };
  }
  return { ok: true, data };
}

export async function getTrackingByCode(code: string): Promise<Track7TrackingResult> {
  const cleaned = code.trim().toUpperCase();
  return track7Get(`/tracking/${encodeURIComponent(cleaned)}`);
}

export async function getTrackingByOrderId(transactionId: string): Promise<Track7TrackingResult> {
  const cleaned = transactionId.trim();
  return track7Get(`/orders/${encodeURIComponent(cleaned)}/tracking`);
}

/**
 * Resolve a consulta como a Track7 espera:
 * - UUID → GET /orders/{id}/tracking (com fallback para tracking_code local)
 * - código de rastreio → GET /tracking/{codigo}
 * - demais valores → tenta pedido e depois código
 */
export async function lookupTrack7(value: string): Promise<Track7TrackingResult> {
  const raw = value.trim();
  if (raw.length < 2 || raw.length > 120) {
    return { ok: false, error: "Informe um código de rastreio válido.", status: 400 };
  }

  if (isUuid(raw)) {
    const byOrder = await getTrackingByOrderId(raw);
    if (byOrder.ok && (byOrder.data.events.length > 0 || byOrder.data.tracking_code)) {
      return byOrder;
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("tracking_code, order_number")
        .eq("id", raw)
        .maybeSingle();

      const localCode = order?.tracking_code?.trim();
      if (localCode) {
        const byCode = await getTrackingByCode(localCode);
        if (byCode.ok) return byCode;
      }

      const orderNumber = order?.order_number?.trim();
      if (orderNumber && orderNumber !== raw) {
        const byNumber = await getTrackingByOrderId(orderNumber);
        if (byNumber.ok) return byNumber;
      }
    } catch {
      // fallback silencioso
    }

    return byOrder.ok ? byOrder : byOrder;
  }

  if (looksLikeTrackingCode(raw)) {
    const byCode = await getTrackingByCode(raw);
    if (byCode.ok) return byCode;

    // Pedidos antigos sincronizados com order_number como transaction_id
    const byOrder = await getTrackingByOrderId(raw);
    if (byOrder.ok) return byOrder;
    return byCode;
  }

  const byOrder = await getTrackingByOrderId(raw);
  if (byOrder.ok) return byOrder;
  return getTrackingByCode(raw);
}
