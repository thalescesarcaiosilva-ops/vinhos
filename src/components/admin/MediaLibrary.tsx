import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSiteImageUrl } from "@/lib/image-url";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Trash2, Upload, Check, AlertTriangle } from "lucide-react";

export type MediaBucket = "product-images" | "banner-images";
const BUCKETS: { id: MediaBucket; label: string }[] = [
  { id: "product-images", label: "Produtos" },
  { id: "banner-images", label: "Banners / Categorias / Logo" },
];

type MediaFile = {
  name: string;
  size: number;
  updated_at: string;
  url: string;
  bucket: MediaBucket;
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function listBucket(bucket: MediaBucket): Promise<MediaFile[]> {
  const { data, error } = await supabase.storage.from(bucket).list("", {
    limit: 1000,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error) { toast.error(`${bucket}: ${error.message}`); return []; }
  return (data ?? [])
    .filter(f => f.name && !f.name.endsWith("/"))
    .map(f => ({
      name: f.name,
      size: (f.metadata as any)?.size ?? 0,
      updated_at: f.updated_at ?? f.created_at ?? "",
      url: toSiteImageUrl(supabase.storage.from(bucket).getPublicUrl(f.name).data.publicUrl),
      bucket,
    }));
}

/** Full media library — gallery mode (tab) or picker mode (dialog). */
export function MediaLibrary({
  mode = "gallery",
  onSelect,
  defaultBucket = "product-images",
}: {
  mode?: "gallery" | "picker";
  onSelect?: (url: string) => void;
  defaultBucket?: MediaBucket;
}) {
  const [bucket, setBucket] = useState<MediaBucket>(defaultBucket);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDup, setPendingDup] = useState<{ file: File; hash: string; existing: MediaFile } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFiles(await listBucket(bucket));
    setLoading(false);
  }, [bucket]);

  useEffect(() => { refresh(); }, [refresh]);

  async function doUpload(file: File, hash: string, forceNew: boolean) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const suffix = forceNew ? `-${Date.now().toString(36)}` : "";
    const path = `${hash.slice(0, 16)}${suffix}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type,
    });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Imagem enviada");
    refresh();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Imagem acima de 10MB"); return; }
    const hash = await sha256Hex(file);
    const prefix = hash.slice(0, 16);
    const existing = files.find(f => f.name.startsWith(prefix));
    if (existing) {
      setPendingDup({ file, hash, existing });
      return;
    }
    doUpload(file, hash, false);
  }

  async function handleDelete(f: MediaFile) {
    if (!confirm(`Excluir "${f.name}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.storage.from(f.bucket).remove([f.name]);
    if (error) { toast.error(error.message); return; }
    toast.success("Imagem excluída");
    setFiles(prev => prev.filter(x => x.name !== f.name));
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  }

  const filtered = query
    ? files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
    : files;

  const cardCls = "group relative overflow-hidden rounded-sm border border-border bg-card";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-sm border border-border bg-background p-1">
          {BUCKETS.map(b => (
            <button key={b.id} type="button" onClick={() => setBucket(b.id)}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${bucket === b.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {b.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome…"
          className="flex-1 min-w-[180px] rounded-sm border border-border bg-background px-3 py-2 text-sm" />
        <label className="cursor-pointer rounded-sm border border-border bg-cream px-4 py-2 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors inline-flex items-center gap-2">
          <Upload className="h-4 w-4" />
          {uploading ? "Enviando…" : "Enviar nova imagem"}
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
        <span className="text-xs text-muted-foreground">{filtered.length} imagem(ns)</span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma imagem neste bucket.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map(f => (
            <div key={f.name} className={cardCls}>
              <div className="aspect-square bg-muted">
                <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="space-y-1 p-2">
                <div className="truncate text-[11px] text-muted-foreground" title={f.name}>{f.name}</div>
                <div className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</div>
                <div className="flex items-center gap-1">
                  {mode === "picker" && onSelect && (
                    <button type="button" onClick={() => onSelect(f.url)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                      <Check className="h-3 w-3" /> Usar
                    </button>
                  )}
                  <button type="button" onClick={() => copyUrl(f.url)} title="Copiar URL"
                    className="rounded-sm border border-border bg-background p-1.5 hover:bg-muted">
                    <Copy className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => handleDelete(f)} title="Excluir"
                    className="rounded-sm border border-border bg-background p-1.5 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Duplicate warning dialog */}
      <Dialog open={!!pendingDup} onOpenChange={(o) => !o && setPendingDup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Imagem duplicada detectada
            </DialogTitle>
          </DialogHeader>
          {pendingDup && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Uma imagem com o mesmo conteúdo já existe no bucket <strong>{bucket}</strong>. O que deseja fazer?
              </p>
              <div className="flex gap-3">
                <div className="flex-1 rounded-sm border border-border p-2">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">Existente</div>
                  <img src={pendingDup.existing.url} alt="" className="aspect-square w-full rounded-sm object-cover" />
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">{pendingDup.existing.name}</div>
                </div>
                <div className="flex-1 rounded-sm border border-border p-2">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">Nova</div>
                  <img src={URL.createObjectURL(pendingDup.file)} alt="" className="aspect-square w-full rounded-sm object-cover" />
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">{pendingDup.file.name}</div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button"
                  onClick={() => {
                    if (mode === "picker" && onSelect) onSelect(pendingDup.existing.url);
                    else copyUrl(pendingDup.existing.url);
                    setPendingDup(null);
                  }}
                  className="flex-1 rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Reutilizar existente
                </button>
                <button type="button"
                  onClick={() => { const p = pendingDup; setPendingDup(null); doUpload(p.file, p.hash, true); }}
                  className="flex-1 rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
                  Enviar mesmo assim
                </button>
                <button type="button" onClick={() => setPendingDup(null)}
                  className="rounded-sm border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Dialog wrapper for picking an image from the library. */
export function MediaPickerDialog({
  open, onOpenChange, onSelect, defaultBucket,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (url: string) => void;
  defaultBucket?: MediaBucket;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Biblioteca de Mídia</DialogTitle>
        </DialogHeader>
        <MediaLibrary
          mode="picker"
          defaultBucket={defaultBucket}
          onSelect={(url) => { onSelect(url); onOpenChange(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
