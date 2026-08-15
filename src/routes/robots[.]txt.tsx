import { createFileRoute } from "@tanstack/react-router";
import { buildRobotsTxt } from "@/lib/seo-sitemap";

const HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "public, max-age=86400",
};

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => new Response(buildRobotsTxt(), { status: 200, headers: HEADERS }),
    },
  },
});
