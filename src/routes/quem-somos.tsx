import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { StoreContainer } from "@/components/store/StoreContainer";
import { STORE } from "@/lib/settings";
import { absoluteSiteUrl, getSiteUrl } from "@/lib/site-url";
import { pageMeta, buildStoreSchema } from "@/lib/seo";

export const Route = createFileRoute("/quem-somos")({
  head: () => {
    const description = `Conheça a ${STORE.name}: curadoria de vinhos selecionados, compra segura e atendimento próximo em Salvador — BA. CNPJ ${STORE.cnpj}.`;
    const seo = pageMeta({
      title: `Quem somos — ${STORE.name}`,
      description,
      path: "/quem-somos",
    });
    const store = buildStoreSchema();
    const { "@context": _ctx, ...storeEntity } = store;
    return {
      ...seo,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "AboutPage",
            name: `Quem somos — ${STORE.name}`,
            description,
            url: absoluteSiteUrl("/quem-somos"),
            mainEntity: storeEntity,
          }),
        },
      ],
    };
  },
  component: QuemSomosPage,
});

const hours = [
  { day: "Segunda-feira", time: "08:00h às 18:00h" },
  { day: "Terça-feira", time: "08:00h às 18:00h" },
  { day: "Quarta-feira", time: "08:00h às 18:00h" },
  { day: "Quinta-feira", time: "08:00h às 18:00h" },
  { day: "Sexta-feira", time: "08:00h às 18:00h" },
  { day: "Sábado", time: "Fechado" },
  { day: "Domingo", time: "Fechado" },
];

function QuemSomosPage() {
  const siteHost = getSiteUrl()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  const infoRows = [
    { label: "Razão social", value: STORE.legalName },
    { label: "CNPJ", value: STORE.cnpj },
    { label: "E-mail", value: STORE.email },
    { label: "Site", value: siteHost },
    { label: "Telefone", value: STORE.phone },
    { label: "Endereço", value: STORE.address },
  ];

  return (
    <div className="bg-background">
      <section className="border-b border-border/70 bg-cream/40">
        <StoreContainer className="py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Quem somos
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Sobre nós
          </h1>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
            <p>
              A Galvao Vinhos nasceu com o propósito de tornar a escolha de um bom vinho mais
              simples, acessível e confiável. Criada por Ana Clara Sena Galvao, a loja une curadoria
              cuidadosa e uma experiência de compra clara, do catálogo ao pós-venda.
            </p>
            <p>
              Somos especializados em vinhos e espumantes selecionados, com atenção à origem, ao
              estilo e ao equilíbrio entre qualidade e preço. Cada rótulo entra no catálogo após
              avaliação criteriosa, para que você encontre opções que façam sentido no dia a dia e
              também em ocasiões especiais.
            </p>
            <p>
              Acreditamos que beber bem é também viver bem — com moderação, descoberta e prazer. Por
              isso reunimos em um só lugar tintos, brancos, rosés, espumantes e combos pensados para
              diferentes paladares, com informações úteis para facilitar sua decisão.
            </p>
            <p>
              Trabalhamos para que a navegação, o pagamento e a entrega sejam transparentes e
              seguros. Valorizamos o relacionamento com nossos clientes e buscamos um atendimento
              ágil, objetivo e próximo.
            </p>
            <p>
              Mais do que vender garrafas, queremos acompanhar sua rotina de descobertas: da
              primeira taça ao próximo pedido. A Galvao Vinhos é o seu espaço de confiança para
              escolher vinhos com praticidade e qualidade.
            </p>
          </div>
        </StoreContainer>
      </section>

      <StoreContainer className="py-12 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Nossa loja
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold text-foreground md:text-3xl">
              Um espaço pensado para a sua experiência com o vinho.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              Operamos em Salvador com atendimento online e suporte em horário comercial. Se
              precisar de ajuda para escolher um rótulo, acompanhar um pedido ou tirar dúvidas sobre
              frete e pagamento, nossa equipe está pronta para orientar.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Compra segura
                </p>
                <p className="mt-2 text-sm text-foreground">
                  Pedidos com confirmação de pagamento, embalagem cuidadosa e rastreio.
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Curadoria
                </p>
                <p className="mt-2 text-sm text-foreground">
                  Seleção por país, uva, estilo e ocasião, com informações claras em cada produto.
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link to="/fale-conosco" className="font-semibold text-primary hover:underline">
                Fale conosco
              </Link>
              <Link to="/rastreio" className="font-semibold text-primary hover:underline">
                Rastrear Pedido
              </Link>
              <Link
                to="/colecao/$slug"
                params={{ slug: "todos" }}
                className="font-semibold text-primary hover:underline"
              >
                Ver produtos
              </Link>
            </div>
          </section>

          <section className="border border-border/70 bg-card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Informações da loja
            </p>
            <h2 className="mt-2 font-serif text-2xl font-bold text-foreground">{STORE.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ficha da loja</p>

            <dl className="mt-6 divide-y divide-border/70 border-y border-border/70">
              {infoRows.map((row) => (
                <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-sm text-foreground break-words">{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">Horário de atendimento</h3>
              </div>
              <ul className="mt-4 space-y-2">
                {hours.map((item) => (
                  <li
                    key={item.day}
                    className="flex items-center justify-between gap-4 border-b border-border/50 py-2 text-sm last:border-0"
                  >
                    <span className="text-muted-foreground">{item.day}</span>
                    <span className="font-medium text-foreground">{item.time}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Exceto feriados</p>
            </div>

            <div className="mt-8 space-y-3 border-t border-border/70 pt-6 text-sm">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="text-muted-foreground">{STORE.address}</p>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="text-muted-foreground">{STORE.phone}</p>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="break-all text-muted-foreground">{STORE.email}</p>
              </div>
            </div>
          </section>
        </div>
      </StoreContainer>
    </div>
  );
}
