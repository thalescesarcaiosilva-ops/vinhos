import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";

export function Reviews({ productId, compact = false }: { productId: string; compact?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const reviewsQ = useQuery({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, title, comment, created_at, user_id")
        .eq("product_id", productId)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      const { error } = await supabase.from("reviews").insert({
        product_id: productId,
        user_id: user.id,
        rating,
        title: title || null,
        comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação enviada!");
      setTitle("");
      setComment("");
      setRating(5);
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === "auth") toast.info("Faça login para avaliar");
      else toast.error("Você precisa ter comprado este produto para avaliar");
    },
  });

  const list = reviewsQ.data ?? [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;

  return (
    <div className={`w-full ${compact ? "pt-5" : "py-8"}`}>
      {list.length > 0 && (
        <div className="mb-6 flex items-center gap-4">
          <div>
            <div className="flex items-center gap-1 text-accent">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-5 w-5 ${i < Math.round(avg) ? "fill-current" : ""}`} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {list.length} avaliação{list.length === 1 ? "" : "ões"} · média {avg.toFixed(1)}
            </p>
          </div>
        </div>
      )}

      <div className="mb-7 border-y border-border/60 py-5">
        <h3 className="mb-3 font-serif text-lg font-bold text-primary">Deixe sua avaliação</h3>
        <div className="mb-3 flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <button key={i} type="button" onClick={() => setRating(i + 1)}>
              <Star
                className={`h-6 w-6 ${i < rating ? "fill-accent text-accent" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título (opcional)"
          className="mb-2 w-full border-0 border-b border-border bg-transparent px-0 py-2 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Conte sua experiência com este vinho..."
          className="w-full resize-none border-0 border-b border-border bg-transparent px-0 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          disabled={create.isPending}
          onClick={() => create.mutate()}
          className="mt-3 rounded-sm bg-primary px-5 py-2 text-sm font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {create.isPending ? "Enviando..." : "Enviar avaliação"}
        </button>
        {!user && (
          <p className="mt-2 text-xs text-muted-foreground">
            É necessário ter comprado o produto para avaliar.
          </p>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há avaliações deste vinho.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {list.map((r) => (
            <li key={r.id} className="py-4">
              <div className="mb-1 flex items-center gap-2">
                <div className="flex text-accent">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-current" : ""}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {r.title && <div className="text-sm font-semibold">{r.title}</div>}
              {r.comment && <p className="mt-1 text-sm text-foreground/80">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
