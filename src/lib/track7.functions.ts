import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Track7TrackingData, Track7TrackingResult } from "@/lib/track7";

type NodeProcessEnv = { env?: Record<string, string | undefined> };

function serverEnv(name: string): string | undefined {
  const proc = (globalThis as typeof globalThis & { process?: NodeProcessEnv }).process;
  return proc?.env?.[name];
}

function track7ApiBase(): string {
  return (serverEnv("TRACK7_API_URL") || "https://track7.app/api/v1").replace(/\/+$/, "");
}

function track7ApiKey(): string {
  const key =
    serverEnv("TRACK7_API_KEY")?.trim() ||
    serverEnv("VITE_TRACK7_TOKEN")?.trim() ||
    "";
  if (!key) {
    throw new Error("TRACK7_API_KEY não configurada no servidor.");
  }
  return key;
}

function normalizeTrackingPayload(raw: unknown): Track7TrackingData | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<
    string,
    unknown
  >;

  const eventsRaw = Array.isArray(data.events) ? data.events : [];
  const events = eventsRaw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const row = e as Record<string, unknown>;
      return {
        date: String(row.date ?? ""),
        location: String(row.location ?? ""),
        status: String(row.status ?? ""),
        description: String(row.description ?? ""),
      };
    })
    .filter(Boolean) as Track7TrackingData["events"];

  const tracking_code = String(data.tracking_code ?? data.trackingCode ?? "").trim();
  const transaction_id = String(data.transaction_id ?? data.transactionId ?? "").trim();
  if (!tracking_code && !transaction_id && events.length === 0) return null;

  return {
    transaction_id,
    tracking_code,
    status: String(data.status ?? ""),
    current_status: String(data.current_status ?? data.currentStatus ?? data.status ?? ""),
    events,
  };
}

async function track7Fetch(path: string): Promise<Track7TrackingResult> {
  let apiKey: string;
  try {
    apiKey = track7ApiKey();
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Chave Track7 ausente", status: 500 };
  }

  const url = `${track7ApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    });
  } catch {
    return { ok: false, error: "Falha de conexão com a Track7. Tente novamente.", status: 502 };
  }

  if (res.status === 401) {
    return { ok: false, error: "Chave da API inválida.", status: 401 };
  }
  if (res.status === 404) {
    return {
      ok: false,
      error: "Pedido não encontrado. Confira o código ou aguarde a postagem.",
      status: 404,
    };
  }
  if (res.status === 429) {
    return { ok: false, error: "Muitas consultas. Aguarde um momento e tente de novo.", status: 429 };
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

const LookupInput = z
  .object({
    trackingCode: z.string().trim().min(2).max(64).optional(),
    transactionId: z.string().trim().min(2).max(120).optional(),
  })
  .refine((v) => Boolean(v.trackingCode || v.transactionId), {
    message: "Informe o código de rastreio ou o ID do pedido.",
  });

/** Consulta rastreio na Track7 (chave só no servidor). */
export const lookupTrack7Tracking = createServerFn({ method: "POST" })
  .inputValidator((d) => LookupInput.parse(d))
  .handler(async ({ data }): Promise<Track7TrackingResult> => {
    if (data.trackingCode) {
      const code = data.trackingCode.trim().toUpperCase();
      return track7Fetch(`/tracking/${encodeURIComponent(code)}`);
    }
    const tx = data.transactionId!.trim();
    return track7Fetch(`/orders/${encodeURIComponent(tx)}/tracking`);
  });
