import { createFileRoute } from "@tanstack/react-router";

const FLAG_PATH = /^w(?:40|80|160)\/[a-z]{2}\.png$/;

async function handle({ params }: { params: { _splat?: string } }) {
  const splat = params._splat?.replace(/^\/+/, "") ?? "";
  if (!FLAG_PATH.test(splat)) return new Response("Not found", { status: 404 });

  const upstream = await fetch(`https://flagcdn.com/${splat}`);
  if (!upstream.ok) return new Response("Not found", { status: upstream.status });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const Route = createFileRoute("/flags/$")({
  server: {
    handlers: {
      GET: handle,
      HEAD: handle,
    },
  },
});