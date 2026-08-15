import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseStorageOrigin } from "@/lib/supabase-storage-origin";

// Proxy de transformação de imagens do Supabase Storage (SUPABASE_URL).
async function proxy(request: Request, params: { _splat?: string }, includeBody: boolean) {
  const splat = params._splat ?? "";
  if (!splat) return new Response("Not found", { status: 404 });

  const reqUrl = new URL(request.url);
  const upstream = `${getSupabaseStorageOrigin()}/storage/v1/render/image/public/${splat}${reqUrl.search}`;

  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) headers.set("if-modified-since", ifModifiedSince);

  const upstreamRes = await fetch(upstream, {
    method: includeBody ? "GET" : "HEAD",
    headers,
  });

  const resHeaders = new Headers();
  const passthrough = ["content-type", "content-length", "etag", "last-modified"];
  for (const k of passthrough) {
    const v = upstreamRes.headers.get(k);
    if (v) resHeaders.set(k, v);
  }
  resHeaders.set("cache-control", "public, max-age=31536000, immutable");
  resHeaders.set("access-control-allow-origin", "*");
  // Supabase Storage sends X-Robots-Tag: none — blocks Google Merchant / Googlebot-Image.
  resHeaders.set("x-robots-tag", "all");

  return new Response(includeBody ? upstreamRes.body : null, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export const Route = createFileRoute("/storage/v1/render/image/public/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => proxy(request, params as { _splat?: string }, true),
      HEAD: ({ request, params }) => proxy(request, params as { _splat?: string }, false),
    },
  },
});
