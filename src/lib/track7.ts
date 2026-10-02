export type Track7Event = {
  date: string;
  location: string;
  status: string;
  description: string;
};

export type Track7TrackingData = {
  transaction_id: string;
  tracking_code: string;
  status: string;
  current_status: string;
  events: Track7Event[];
};

export type Track7TrackingResult =
  | { ok: true; data: Track7TrackingData }
  | { ok: false; error: string; status?: number };

/**
 * Interpreta datas Track7: ISO, "DD/MM/YYYY", "DD/MM/YYYY - HH:mm".
 * Retorna timestamp ms ou 0 se inválido.
 */
export function parseTrack7Date(raw: string): number {
  const s = String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-");
  if (!s) return 0;

  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) return 0;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = Number(m[4] ?? 0);
  const minute = Number(m[5] ?? 0);
  const second = Number(m[6] ?? 0);
  // Meio-dia UTC evita virar o dia anterior por fuso; com hora, assume horário de Brasília (UTC−3).
  const utcHour = m[4] != null ? hour + 3 : 12;
  const ts = Date.UTC(year, month - 1, day, utcHour, minute, second);
  return Number.isNaN(ts) ? 0 : ts;
}

/** Mais recente primeiro. Se as datas não parsearem, inverte a ordem da API (costuma vir antiga→nova). */
export function sortTrack7EventsNewestFirst<T extends { date: string }>(events: T[]): T[] {
  if (events.length <= 1) return [...events];
  const scored = events.map((e, index) => ({ e, index, t: parseTrack7Date(e.date) }));
  const anyParsed = scored.some((s) => s.t > 0);
  if (!anyParsed) return [...events].reverse();
  scored.sort((a, b) => (b.t !== a.t ? b.t - a.t : a.index - b.index));
  return scored.map((s) => s.e);
}

/** Estágios do progresso Track7 (mesma ordem da página oficial). */
export const TRACK7_STAGES = [
  { id: "posted", label: "Postado", match: /postad/i },
  { id: "collected", label: "Coletado", match: /coletad/i },
  {
    id: "transit",
    label: "Em Trânsito",
    match: /tr[aâ]nsito|em movimento|transitand|separado|pronto para transporte/i,
  },
  {
    id: "destination",
    label: "Destino",
    match: /destino|tratamento|recebido em|unidade de tratamento|centro de distribui/i,
  },
  {
    id: "out_for_delivery",
    label: "Saiu p/ Entrega",
    match: /saiu\s*(p\/|para)?\s*entrega|rota de entrega|em rota/i,
  },
  { id: "waiting", label: "Aguardando", match: /aguardando|entregue|dispon[ií]vel|retirada/i },
] as const;

export function resolveTrack7StageIndex(data: Track7TrackingData): number {
  const haystack = [
    data.current_status,
    data.status,
    ...data.events.map((e) => `${e.status} ${e.description}`),
  ]
    .join(" \n ")
    .toLowerCase();

  let best = 0;
  for (let i = 0; i < TRACK7_STAGES.length; i++) {
    if (TRACK7_STAGES[i].match.test(haystack)) best = i;
  }

  const latest = data.events[0];
  if (latest) {
    const latestText = `${latest.status} ${latest.description}`;
    for (let i = TRACK7_STAGES.length - 1; i >= 0; i--) {
      if (TRACK7_STAGES[i].match.test(latestText)) return i;
    }
  }

  return best;
}
