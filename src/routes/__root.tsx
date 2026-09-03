import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Header } from "@/components/store/Header";
import { Footer } from "@/components/store/Footer";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { ThemeStyle } from "@/components/store/ThemeStyle";
import { CartDrawer } from "@/components/store/CartDrawer";
import { HeadTrackingScripts } from "@/components/store/HeadTrackingScripts";
import { fetchStoreSettings, STORE_SETTINGS_QUERY_KEY } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { DEFAULT_OG_IMAGE, SEO, buildStoreSchema } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 font-serif text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Voltar à loja
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente ou volte para a loja.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Tentar novamente</button>
          <a href="/" className="rounded-sm border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground">Ir para o início</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    // Prefetch no SSR/navegação: Header/Footer/Benefits usam só dados reais, sem placeholder R$0.
    await context.queryClient.ensureQueryData({
      queryKey: STORE_SETTINGS_QUERY_KEY,
      queryFn: fetchStoreSettings,
      staleTime: 5 * 60_000,
    });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-site-verification", content: "gR2W2gQ9M4DKb3uwUjXh_m8FQiWxntgNo05ZxQU5_2U" },
      { title: SEO.homeTitle },
      { name: "description", content: SEO.homeDescription },
      { property: "og:title", content: SEO.homeTitle },
      { property: "og:description", content: SEO.homeDescription },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: STORE.name },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:title", content: SEO.homeTitle },
      { name: "twitter:description", content: SEO.homeDescription },
      { property: "og:image", content: DEFAULT_OG_IMAGE },
      { name: "twitter:image", content: DEFAULT_OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/assets/favicon.png" },
      { rel: "shortcut icon", type: "image/png", href: "/assets/favicon.png" },
      { rel: "apple-touch-icon", href: "/assets/favicon.png" },
      { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
      { rel: "stylesheet", href: appCss },
      // Fonte: display=optional reduz CLS; preconnect só se a stylesheet pedir gstatic em seguida.
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,400;0,500;0,600;0,700;1,400&display=optional",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildStoreSchema()),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCheckout = pathname.startsWith("/checkout");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <HeadTrackingScripts />
          <ThemeStyle />
          <div className="flex min-h-screen flex-col">
            {!isCheckout && <Header />}
            <main className="flex-1"><Outlet /></main>
            <Footer />
          </div>
          <CartDrawer />
          <Toaster position="top-right" />
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
