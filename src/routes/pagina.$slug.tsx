import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { fetchStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { descriptionFromContent, pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/pagina/$slug")({
  loader: async ({ params }) => {
    const settings = await fetchStoreSettings();
    const page = settings.footer.institutional.find((p) => p.slug === params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData, params }) => {
    const label = loaderData?.page.label ?? "Página";
    const content = loaderData?.page.content ?? "";
    const title = `${label} — ${STORE.name}`;
    const description = descriptionFromContent(
      content,
      `${label} da ${STORE.name}. Informações institucionais, políticas e atendimento.`,
    );
    return pageMeta({
      title,
      description,
      path: `/pagina/${params.slug}`,
    });
  },
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-2xl text-primary">Erro ao carregar página</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground">Tentar novamente</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-2xl text-primary">Página não encontrada</h1>
      <Link to="/" className="mt-4 inline-block rounded-sm bg-primary px-4 py-2 text-sm text-primary-foreground">Voltar à loja</Link>
    </div>
  ),
  component: InstitutionalPage,
});

function InstitutionalPage() {
  const { page } = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-3xl font-bold text-primary">{page.label}</h1>
      <div className="prose prose-sm mt-6 max-w-none whitespace-pre-wrap text-foreground">
        {page.content}
      </div>
    </div>
  );
}
