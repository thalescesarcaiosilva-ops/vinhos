import { Link } from "@tanstack/react-router";
import { StoreContainer } from "@/components/store/StoreContainer";
import { useStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";

/**
 * Bloco "Quem somos" da home (desktop), acima do rodapé.
 * Logo suave acima do texto + foto da loja (mesma de /quem-somos).
 */
export function HomeAboutSection() {
  const { data: settings } = useStoreSettings();
  const logoSrc = settings?.brand?.logoUrl
    ? toTransformedImageUrl(toSiteImageUrl(settings.brand.logoUrl), {
        width: 320,
        quality: 70,
        format: "webp",
        resize: "contain",
      }) || toSiteImageUrl(settings.brand.logoUrl)
    : "/assets/favicon.png";

  return (
    <section
      className="hidden bg-[#f2f2f2] py-8 lg:block lg:py-10"
      aria-labelledby="home-about-heading"
    >
      <StoreContainer>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-10 xl:grid-cols-[1fr_minmax(0,32rem)]">
          <div>
            <img
              src={logoSrc}
              alt=""
              aria-hidden
              width={200}
              height={80}
              loading="lazy"
              decoding="async"
              className="mb-4 h-12 w-auto max-w-[11rem] object-contain opacity-25"
            />
            <h2
              id="home-about-heading"
              className="text-xl font-bold uppercase tracking-[0.08em] text-foreground"
            >
              Quem somos
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              A Galvao Vinhos nasceu para tornar a escolha de um bom vinho mais simples, acessível e
              confiável. Unimos curadoria cuidadosa de vinhos e espumantes a uma compra clara e
              segura — do catálogo ao pós-venda — com atendimento próximo em Salvador — BA.
            </p>
            <Link
              to="/quem-somos"
              className="mt-4 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Conhecer a loja
            </Link>
          </div>

          <div className="overflow-hidden bg-muted/40">
            <img
              src="/assets/loja-galvao-vinhos.png"
              alt={`Interior da ${STORE.name} em Salvador, com prateleiras de vinhos selecionados`}
              width={960}
              height={640}
              loading="lazy"
              decoding="async"
              className="aspect-[3/2] h-auto max-h-56 w-full object-cover"
            />
          </div>
        </div>
      </StoreContainer>
    </section>
  );
}
