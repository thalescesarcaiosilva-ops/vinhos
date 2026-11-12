import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { fetchStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { descriptionFromContent, pageMeta } from "@/lib/seo";
import { linkifyContactHtml } from "@/lib/contact-links";
import { sanitizeProductHtml } from "@/lib/html-content";

export const Route = createFileRoute("/politicas/$slug")({
  loader: async ({ params }) => {
    const settings = await fetchStoreSettings();
    const page = settings.footer.institutional.find((p) => p.slug === params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData, params }) => {
    const label = loaderData?.page.label ?? "Política";
    const content = loaderData?.page.content ?? "";
    const title = `${label} — ${STORE.name}`;
    const description = descriptionFromContent(
      content,
      `${label} da ${STORE.name}. Informações institucionais, políticas e atendimento.`,
    );
    return pageMeta({
      title,
      description,
      path: `/politicas/${params.slug}`,
    });
  },
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-2xl text-primary">Erro ao carregar página</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Tentar novamente
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-2xl text-primary">Página não encontrada</h1>
      <Link to="/" className="mt-4 inline-block rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
        Voltar à loja
      </Link>
    </div>
  ),
  component: PolicyPage,
});

/** Data de vigência publicada no topo das políticas (fixa — não recalcular automaticamente). */
const POLICY_EFFECTIVE_LABEL = "10 de novembro de 2026";

function PolicyPage() {
  const { page } = Route.useLoaderData();
  const html = sanitizeProductHtml(linkifyContactHtml(page.content));
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-primary">{page.label}</h1>

      <aside className="mt-6 rounded-sm border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
        <p className="font-semibold text-primary">Política vigente</p>
        <p className="mt-1 text-muted-foreground">
          Este documento está em vigor e é válido a partir de{" "}
          <span className="font-medium text-foreground">{POLICY_EFFECTIVE_LABEL}</span>. Em caso
          de dúvida, fale com o atendimento antes de concluir a compra.
        </p>
      </aside>

      <div
        className="prose prose-sm mt-6 max-w-none whitespace-pre-wrap text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
