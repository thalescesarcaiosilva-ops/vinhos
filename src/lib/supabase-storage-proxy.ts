import { getSupabaseStorageOrigin } from "@/lib/supabase-storage-origin";

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "apikey",
  "x-client-info",
  "content-type",
  "x-upsert",
  "cache-control",
  "range",
  "if-none-match",
  "if-modified-since",
];

const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
];

/** Repassa chamadas da API Storage (list, upload, delete) para o Supabase real. */
export async function proxySupabaseStorageApi(request: Request, storagePath: string): Promise<Response> {
  const url = new URL(request.url);
  const upstream = `${getSupabaseStorageOrigin()}/storage/v1/${storagePath}${url.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method;
  const upstreamRes = await fetch(upstream, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
  });

  const resHeaders = new Headers();
  for (const key of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstreamRes.headers.get(key);
    if (value) resHeaders.set(key, value);
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}
