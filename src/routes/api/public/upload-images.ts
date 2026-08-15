import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upload-token",
};

export const Route = createFileRoute("/api/public/upload-images")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          // Simple shared-secret auth so this public endpoint isn't open to the world.
          // Set UPLOAD_TOKEN in env vars and send it as `x-upload-token` header.
          const expectedToken = process.env.UPLOAD_TOKEN;
          if (expectedToken) {
            const provided = request.headers.get("x-upload-token");
            if (provided !== expectedToken) {
              return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const formData = await request.formData();
          const bucket = formData.get("bucket")?.toString() || "product-images";
          const folder = formData.get("folder")?.toString() || "";
          const results: Array<{ name: string; status: string; message: string | null }> = [];

          for (const [key, value] of formData.entries()) {
            if (key === "bucket" || key === "folder") continue;
            if (!(value instanceof File)) continue;

            const filePath = folder
              ? `${folder.replace(/\/$/, "")}/${value.name}`
              : value.name;

            const { error } = await supabaseAdmin.storage
              .from(bucket)
              .upload(filePath, value, {
                contentType: value.type || "application/octet-stream",
                upsert: true,
              });

            results.push({
              name: value.name,
              status: error
                ? (error.message?.includes("already exists") ? "skip" : "error")
                : "ok",
              message: error?.message ?? null,
            });
          }

          return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
