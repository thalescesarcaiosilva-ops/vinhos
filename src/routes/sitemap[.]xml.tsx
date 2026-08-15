import { createFileRoute } from "@tanstack/react-router";
import { buildSitemapXml, collectSitemapUrls, getStaticSitemapUrls } from "@/lib/seo-sitemap";

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const urls = await collectSitemapUrls();
          return new Response(buildSitemapXml(urls), { status: 200, headers: HEADERS });
        } catch (error) {
          console.error("[sitemap.xml] fallback to static URLs:", error);
          return new Response(buildSitemapXml(getStaticSitemapUrls()), {
            status: 200,
            headers: HEADERS,
          });
        }
      },
    },
  },
});
