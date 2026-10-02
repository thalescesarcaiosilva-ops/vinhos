import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Track7TrackingResult } from "@/lib/track7";
import { lookupTrack7 } from "@/lib/track7-client";

const LookupInput = z
  .object({
    /** Valor digitado ou query (?codigo= / ?pedido=). */
    query: z.string().trim().min(2).max(120).optional(),
    trackingCode: z.string().trim().min(2).max(64).optional(),
    transactionId: z.string().trim().min(2).max(120).optional(),
  })
  .refine((v) => Boolean(v.query || v.trackingCode || v.transactionId), {
    message: "Informe o código de rastreio ou o ID do pedido.",
  });

/** Consulta rastreio na Track7 (chave só no servidor). */
export const lookupTrack7Tracking = createServerFn({ method: "POST" })
  .inputValidator((d) => LookupInput.parse(d))
  .handler(async ({ data }): Promise<Track7TrackingResult> => {
    if (data.transactionId) return lookupTrack7(data.transactionId);
    if (data.trackingCode) return lookupTrack7(data.trackingCode);
    return lookupTrack7(data.query!);
  });
