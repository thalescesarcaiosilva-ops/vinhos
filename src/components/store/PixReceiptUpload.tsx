import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { uploadPixReceipt } from "@/lib/pix-receipt.functions";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, Loader2, Upload } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

export function PixReceiptUpload({
  orderId,
  token,
  alreadyUploaded,
  onUploaded,
  compact,
}: {
  orderId: string;
  /** Token do checkout (convidado). Em Meus Pedidos pode omitir se autenticado. */
  token?: string | null;
  alreadyUploaded?: boolean;
  onUploaded?: () => void;
  compact?: boolean;
}) {
  const upload = useServerFn(uploadPixReceipt);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(alreadyUploaded));

  if (done) {
    return (
      <div
        className={`flex items-start gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-3 text-left text-sm text-emerald-900 ${
          compact ? "" : "mt-4"
        }`}
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Comprovante enviado</p>
          <p className="text-xs opacity-90">
            Nossa equipe vai analisar e confirmar o pagamento. O status do pedido atualiza quando for aprovado.
          </p>
        </div>
      </div>
    );
  }

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Envie apenas JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 5 MB.");
      return;
    }

    setBusy(true);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await upload({
        data: {
          orderId,
          token: token || null,
          filename: file.name,
          mime: file.type,
          dataBase64,
        },
      });
      setDone(true);
      toast.success("Comprovante enviado com sucesso");
      onUploaded?.();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar o comprovante");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={`rounded-md border border-dashed border-border bg-muted/30 px-4 py-4 text-left ${compact ? "" : "mt-4"}`}>
      <div className="flex items-start gap-3">
        <ImagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Já pagou e o status não atualizou?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Envie o comprovante do Pix (JPEG, PNG ou WebP, até 5&nbsp;MB). Isso não confirma o pagamento sozinho —
            nossa equipe analisa e libera o pedido.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {busy ? "Enviando…" : "Enviar comprovante"}
          </button>
        </div>
      </div>
    </div>
  );
}
