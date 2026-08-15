import { createFileRoute, Link } from "@tanstack/react-router";
import { PackageSearch } from "lucide-react";
import { z } from "zod";
import { TrackOrderPanel } from "@/components/store/TrackOrderPanel";
import { STORE } from "@/lib/settings";
import { pageMeta } from "@/lib/seo";

const searchSchema = z.object({
  codigo: z.string().optional(),
});

export const Route = createFileRoute("/rastreio")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () =>
    pageMeta({
      title: `Rastrear pedido — ${STORE.name}`,
      description: `Acompanhe a entrega do seu pedido na ${STORE.name} com o código de rastreio. Atualizações em tempo real.`,
      path: "/rastreio",
    }),
  component: TrackingPage,
});

function TrackingPage() {
  const { codigo: codigoQuery } = Route.useSearch();

  return (
    <div className="min-h-[70vh] bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="border-b border-border pb-8 sm:pb-10">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            <PackageSearch className="h-4 w-4" aria-hidden="true" />
            Acompanhe sua entrega
          </div>
          <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Rastrear pedido
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Digite o código de rastreio enviado por e-mail ou disponível em{" "}
            <Link
              to="/minha-conta"
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
            >
              Meus pedidos
            </Link>
            .
          </p>
        </header>

        <section className="pt-8 sm:pt-10" aria-label="Consulta de rastreio">
          <TrackOrderPanel initialCode={codigoQuery?.trim() ?? ""} />
        </section>

        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          Em caso de dúvida,{" "}
          <Link
            to="/fale-conosco"
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
          >
            fale conosco
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
