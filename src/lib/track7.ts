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
