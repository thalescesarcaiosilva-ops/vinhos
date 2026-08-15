import { createFileRoute } from "@tanstack/react-router";
import { buildProductFeedXml } from "@/lib/product-feed-xml";

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=1800",
};

export const Route = createFileRoute("/product-feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const xml = await buildProductFeedXml();
          return new Response(xml, { status: 200, headers: HEADERS });
        } catch (error) {
          console.error("[product-feed.xml]", error);
          const message = error instanceof Error ? error.message : "Erro ao gerar feed";
          return new Response(`<?xml version="1.0"?><error>${message}</error>`, {
            status: 503,
            headers: HEADERS,
          });
        }
      },
    },
  },
});
