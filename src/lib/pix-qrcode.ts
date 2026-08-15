import QRCode from "qrcode";

/** EMV copia-e-cola (começa com 000201). */
export function isPixEmvPayload(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("000201");
}

/** Extrai o código Pix copia e cola dos campos retornados pela PayoutBR/Hydra. */
export function extractPixCopyPaste(pix: Record<string, unknown> | null | undefined): string | null {
  if (!pix) return null;
  const candidates = [
    pix.qrcodeText,
    pix.qrcode,
    pix.copyPaste,
    pix.copy_paste,
    pix.qr_code,
    pix.emv,
    pix.payload,
  ];
  for (const value of candidates) {
    if (isPixEmvPayload(value)) return value;
  }
  return null;
}

/** Imagem pronta da API (base64 ou URL), se existir. */
export function extractPixImageFromApi(pix: Record<string, unknown> | null | undefined): string | null {
  if (!pix) return null;
  const raw = pix.qr_code_base64 ?? pix.qrcodeBase64 ?? pix.qrcodeImage;
  if (typeof raw === "string" && raw.length > 0 && !isPixEmvPayload(raw)) {
    if (raw.startsWith("data:")) return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    return `data:image/png;base64,${raw}`;
  }
  const url = pix.qr_code_url ?? pix.qrcodeUrl ?? pix.receiptUrl;
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) return url;
  return null;
}

export async function buildPixQrDataUrl(copyPaste: string | null, apiImage?: string | null): Promise<string | null> {
  if (apiImage) return apiImage;
  if (!copyPaste) return null;
  try {
    return await QRCode.toDataURL(copyPaste, { width: 320, margin: 1, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}

export function extractPixExpiration(pix: Record<string, unknown> | null | undefined): string | null {
  if (!pix) return null;
  const raw = pix.expirationDate ?? pix.expires_at ?? pix.expiration_date;
  return typeof raw === "string" ? raw : null;
}
