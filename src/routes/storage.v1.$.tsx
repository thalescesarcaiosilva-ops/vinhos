import { createFileRoute } from "@tanstack/react-router";
import { proxySupabaseStorageApi } from "@/lib/supabase-storage-proxy";

// Proxy da API Storage (list, upload, delete, etc.) quando o cliente Supabase usa
// same-origin em produção. Rotas mais específicas (object/public, render/image/public)
// continuam responsáveis por GET/HEAD de imagens públicas com X-Robots-Tag.
async function handle({ request, params }: { request: Request; params: { _splat?: string } }) {
  const splat = params._splat?.replace(/^\/+/, "");
  if (!splat) return new Response("Not found", { status: 404 });
  return proxySupabaseStorageApi(request, splat);
}

export const Route = createFileRoute("/storage/v1/$")({
  server: {
    handlers: {
      GET: handle,
      HEAD: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
    },
  },
});
