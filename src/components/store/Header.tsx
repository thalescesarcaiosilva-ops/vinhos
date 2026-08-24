import { Link, useNavigate } from "@tanstack/react-router";
import {
  Search,
  ShoppingBag,
  User,
  Menu,
  X,
  Package,
  ChevronDown,
  Mail,
  Heart,
  PackageSearch,
  ArrowRight,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";
import { flagImgUrl } from "@/lib/country-flags";
import { useFavoritesList } from "@/lib/favorites";
import { useActiveCollections } from "@/lib/active-collections";
import { StoreContainer } from "@/components/store/StoreContainer";

type Country = { slug: string; label: string; cc: string };
type Group = { label: string; items: Array<{ to: string; label: string }> };
type HeaderStaticRoute =
  "/" | "/fale-conosco" | "/rastreio" | "/minha-conta" | "/login" | "/favoritos" | "/carrinho";

/** Menu de países — só exibidos se houver produtos ativos com esse country no banco. */
const ALL_MENU_COUNTRIES: Country[] = [
  { slug: "argentina", label: "Argentina", cc: "ar" },
  { slug: "brasil", label: "Brasil", cc: "br" },
  { slug: "portugal", label: "Portugal", cc: "pt" },
  { slug: "franca", label: "França", cc: "fr" },
  { slug: "espanha", label: "Espanha", cc: "es" },
  { slug: "chile", label: "Chile", cc: "cl" },
  { slug: "alemanha", label: "Alemanha", cc: "de" },
  { slug: "australia", label: "Austrália", cc: "au" },
  { slug: "uruguai", label: "Uruguai", cc: "uy" },
  { slug: "africa-do-sul", label: "África do Sul", cc: "za" },
  { slug: "austria", label: "Áustria", cc: "at" },
  { slug: "italia", label: "Itália", cc: "it" },
  { slug: "israel", label: "Israel", cc: "il" },
  { slug: "eua", label: "Estados Unidos", cc: "us" },
  { slug: "macedonia-do-norte", label: "Macedônia do Norte", cc: "mk" },
  { slug: "nova-zelandia", label: "Nova Zelândia", cc: "nz" },
  { slug: "marrocos", label: "Marrocos", cc: "ma" },
  { slug: "moldavia", label: "Moldávia", cc: "md" },
  { slug: "bulgaria", label: "Bulgária", cc: "bg" },
];

function Flag({ cc, alt, className = "" }: { cc: string; alt: string; className?: string }) {
  const src = flagImgUrl(cc, 40);
  return (
    <img
      src={src}
      srcSet={`${flagImgUrl(cc, 80)} 2x`}
      width={32}
      height={24}
      alt={alt}
      loading="lazy"
      className={`inline-block h-6 w-8 rounded-sm object-cover shadow-sm ring-1 ring-border ${className}`}
    />
  );
}

const priceGroups: Group[] = [
  {
    label: "Por faixa de preço",
    items: [
      { to: "/colecao/ate-100", label: "Até R$ 100" },
      { to: "/colecao/100-200", label: "R$ 100 a R$ 200" },
      { to: "/colecao/200-300", label: "R$ 200 a R$ 300" },
      { to: "/colecao/acima-300", label: "Acima de R$ 300" },
    ],
  },
];

const tipoGroups: Group[] = [
  {
    label: "Vinhos",
    items: [
      { to: "/colecao/so-vinhos", label: "Todos os Vinhos" },
      { to: "/colecao/tintos", label: "Tintos" },
      { to: "/colecao/brancos", label: "Brancos" },
      { to: "/colecao/roses", label: "Rosés" },
      { to: "/colecao/vinhos-zero-alcool", label: "Zero Álcool" },
    ],
  },
  {
    label: "Espumantes",
    items: [
      { to: "/colecao/so-espumantes", label: "Todos os Espumantes" },
      { to: "/colecao/espumantes-brancos", label: "Brancos" },
      { to: "/colecao/espumantes-roses", label: "Rosés" },
      { to: "/colecao/espumantes-zero-alcool", label: "Zero Álcool" },
    ],
  },
];

const combosGroups: Group[] = [
  {
    label: "Só Vinhos",
    items: [
      { to: "/colecao/combos-vinhos-tintos", label: "Tintos" },
      { to: "/colecao/combos-vinhos-brancos", label: "Brancos" },
      { to: "/colecao/combos-vinhos-roses", label: "Rosés" },
      { to: "/colecao/combos-vinhos-tintos-roses", label: "Tintos e Rosés" },
      { to: "/colecao/combos-vinhos-brancos-roses", label: "Brancos e Rosés" },
      { to: "/colecao/combos-vinhos-zero-alcool", label: "Zero Álcool" },
    ],
  },
  {
    label: "Só Espumantes",
    items: [
      { to: "/colecao/combos-espumantes-brancos", label: "Brancos" },
      { to: "/colecao/combos-espumantes-roses", label: "Rosés" },
      { to: "/colecao/combos-espumantes-brancos-roses", label: "Brancos e Rosés" },
      { to: "/colecao/combos-espumantes-zero-alcool", label: "Zero Álcool" },
    ],
  },
];

function filterMenuGroups(groups: Group[], allowedSlugs: Set<string>): Group[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedSlugs.has(item.to.replace("/colecao/", ""))),
    }))
    .filter((group) => group.items.length > 0);
}

function normCountryLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function Header() {
  const { count } = useCart();
  const { user } = useAuth();
  const favorites = useFavoritesList();
  const { data: settings } = useStoreSettings();
  const freeFrom = settings?.shipping?.freeShippingFrom;
  const logoMaxHeight = settings?.brand?.logoMaxHeight || 54;
  const logoSrc = settings?.brand?.logoUrl
    ? toTransformedImageUrl(toSiteImageUrl(settings.brand.logoUrl), {
        width: 280,
        quality: 80,
        format: "webp",
        resize: "contain",
      }) || toSiteImageUrl(settings.brand.logoUrl)
    : "/assets/favicon.png";
  const accountHref = user ? "/minha-conta" : "/login";
  const accountLabel = user ? "Minha conta" : "Entre ou Cadastre-se";
  const [open, setOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const activeCollections = useActiveCollections();

  const visiblePriceGroups = useMemo(
    () =>
      activeCollections.data
        ? filterMenuGroups(priceGroups, activeCollections.data.priceSlugs)
        : [],
    [activeCollections.data],
  );
  const visibleTipoGroups = useMemo(
    () =>
      activeCollections.data
        ? filterMenuGroups(tipoGroups, activeCollections.data.categorySlugs)
        : [],
    [activeCollections.data],
  );
  const visibleCombosGroups = useMemo(
    () =>
      activeCollections.data
        ? filterMenuGroups(combosGroups, activeCollections.data.categorySlugs)
        : [],
    [activeCollections.data],
  );

  const countries = useMemo(() => {
    if (!activeCollections.data) return [];
    const active = new Set([...activeCollections.data.countryLabels].map(normCountryLabel));
    if (active.has("eua") || active.has("usa") || active.has("estados unidos")) {
      active.add("estados unidos");
      active.add("eua");
    }
    if (active.has("macedonia do norte") || active.has("macedonia")) {
      active.add("macedonia do norte");
    }
    return ALL_MENU_COUNTRIES.filter((c) => active.has(normCountryLabel(c.label)));
  }, [activeCollections.data]);

  useEffect(() => {
    if (!open && !searchOpen && !desktopMenu) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSearchOpen(false);
        setDesktopMenu(null);
      }
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearchOpen(false);
        setDesktopMenu(null);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [desktopMenu, open, searchOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 bg-background shadow-[0_3px_14px_rgba(34,16,18,0.06)]"
    >
      {/* Topbar intencionalmente simples em todos os tamanhos. */}
      <div className="min-h-8 bg-primary text-primary-foreground">
        <StoreContainer className="flex min-h-8 items-center justify-center text-center text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px]">
          {typeof freeFrom === "number" && freeFrom > 0 ? (
            <>Frete grátis acima de R$ {freeFrom.toFixed(2).replace(".", ",")}</>
          ) : (
            <span className="opacity-0" aria-hidden>
              Frete grátis
            </span>
          )}
        </StoreContainer>
      </div>

      {/* Uma única linha principal; dropdowns e busca são sobrepostos e não provocam reflow. */}
      <div className="relative border-b border-border/40 bg-background">
        <StoreContainer className="grid h-[68px] grid-cols-[1fr_auto_1fr] items-center gap-2 md:h-[82px]">
          <div className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => {
                setOpen((value) => !value);
                setSearchOpen(false);
              }}
              aria-expanded={open}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              className="grid h-10 w-10 place-items-center text-foreground transition-colors hover:text-primary xl:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <HeaderAction
              to="/rastreio"
              label="Rastrear pedido"
              icon={<PackageSearch />}
              className="flex xl:hidden"
              onClick={() => {
                setOpen(false);
                setSearchOpen(false);
              }}
            />
            <HeaderAction
              to="/favoritos"
              label="Favoritos"
              icon={<Heart />}
              className="flex xl:hidden"
              count={favorites.length}
              onClick={() => {
                setOpen(false);
                setSearchOpen(false);
              }}
            />

            <nav className="hidden items-center xl:flex" aria-label="Categorias de produtos">
              {visiblePriceGroups.length > 0 && (
                <DesktopNavMenu
                  id="precos"
                  label="Preços"
                  open={desktopMenu === "precos"}
                  onToggle={() => {
                    setDesktopMenu(desktopMenu === "precos" ? null : "precos");
                    setSearchOpen(false);
                  }}
                  onNavigate={() => setDesktopMenu(null)}
                  groups={visiblePriceGroups}
                />
              )}
              {countries.length > 0 && (
                <DesktopCountriesMenu
                  open={desktopMenu === "paises"}
                  onToggle={() => {
                    setDesktopMenu(desktopMenu === "paises" ? null : "paises");
                    setSearchOpen(false);
                  }}
                  onNavigate={() => setDesktopMenu(null)}
                  countries={countries}
                />
              )}
              {visibleTipoGroups.length > 0 && (
                <DesktopNavMenu
                  id="tipos"
                  label="Tipos"
                  open={desktopMenu === "tipos"}
                  onToggle={() => {
                    setDesktopMenu(desktopMenu === "tipos" ? null : "tipos");
                    setSearchOpen(false);
                  }}
                  onNavigate={() => setDesktopMenu(null)}
                  groups={visibleTipoGroups}
                  wide
                />
              )}
              {visibleCombosGroups.length > 0 && (
                <DesktopNavMenu
                  id="combos"
                  label="Combos"
                  open={desktopMenu === "combos"}
                  onToggle={() => {
                    setDesktopMenu(desktopMenu === "combos" ? null : "combos");
                    setSearchOpen(false);
                  }}
                  onNavigate={() => setDesktopMenu(null)}
                  groups={visibleCombosGroups}
                  wide
                />
              )}
              {activeCollections.data?.virtualSlugs.has("todos") && (
                <Link
                  to="/colecao/$slug"
                  params={{ slug: "todos" }}
                  onClick={() => setDesktopMenu(null)}
                  className="whitespace-nowrap px-2.5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary transition-colors hover:text-foreground"
                >
                  Todos os produtos
                </Link>
              )}
            </nav>
          </div>

          <Link
            to="/"
            onClick={() => {
              setOpen(false);
              setDesktopMenu(null);
              setSearchOpen(false);
            }}
            className="shrink-0"
            aria-label={`${STORE.name} — página inicial`}
          >
            <img
              src={logoSrc}
              alt={STORE.name}
              width={122}
              height={61}
              fetchPriority="high"
              decoding="async"
              style={{ maxHeight: logoMaxHeight }}
              className="h-9 w-auto object-contain sm:h-12 md:h-[54px]"
            />
          </Link>

          <nav className="flex min-w-0 items-center justify-end" aria-label="Atalhos da loja">
            <button
              type="button"
              onClick={() => {
                setSearchOpen((value) => !value);
                setDesktopMenu(null);
              }}
              className="relative grid h-9 w-9 place-items-center text-foreground transition-colors hover:text-primary sm:h-10 sm:w-10 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[1.7]"
              aria-label={searchOpen ? "Fechar pesquisa" : "Pesquisar produtos"}
              aria-expanded={searchOpen}
            >
              {searchOpen ? <X /> : <Search />}
            </button>
            <HeaderAction
              to={accountHref}
              label={user ? "Minha conta" : "Entrar"}
              icon={<User />}
              className="flex"
            />
            <HeaderAction
              to="/favoritos"
              label="Favoritos"
              icon={<Heart />}
              className="hidden xl:flex"
              count={favorites.length}
            />
            <HeaderAction
              to="/rastreio"
              label="Rastrear pedido"
              icon={<PackageSearch />}
              className="hidden xl:flex"
            />
            <HeaderAction
              to="/fale-conosco"
              label="Fale conosco"
              icon={<Mail />}
              className="hidden 2xl:flex"
            />
            <HeaderAction
              to="/carrinho"
              label="Carrinho"
              icon={<ShoppingBag />}
              className="flex"
              count={count}
            />
          </nav>
        </StoreContainer>

        {searchOpen && (
          <div className="absolute inset-x-0 top-full z-50 px-4 pt-2 sm:left-auto sm:right-4 sm:w-[460px] sm:px-0">
            <div className="bg-background p-3 shadow-[0_14px_32px_rgba(34,16,18,0.14)]">
              <HeaderSearchForm autoFocus onSubmit={() => setSearchOpen(false)} />
            </div>
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/45 xl:hidden" onClick={() => setOpen(false)}>
          <aside
            className="absolute left-0 top-0 h-full w-[min(88vw,360px)] overflow-y-auto bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <img
                src={logoSrc}
                alt={STORE.name}
                width={100}
                height={50}
                style={{ maxHeight: Math.min(logoMaxHeight, 48) }}
                className="h-10 w-auto object-contain"
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="grid h-10 w-10 place-items-center text-foreground transition-colors hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {activeCollections.data?.virtualSlugs.has("todos") && (
                <Link
                  to="/colecao/$slug"
                  params={{ slug: "todos" }}
                  onClick={() => setOpen(false)}
                  className="mb-3 flex items-center justify-between border-b border-border/60 px-1 py-3 text-sm font-semibold text-primary"
                >
                  Todos os produtos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}

              {visiblePriceGroups.length > 0 && (
                <MobileSection
                  label="Comprar por preço"
                  id="precos"
                  open={mobileTab === "precos"}
                  onToggle={() => setMobileTab(mobileTab === "precos" ? null : "precos")}
                >
                  {visiblePriceGroups.flatMap((group) =>
                    group.items.map((i) => (
                      <MobileLink key={i.to} to={i.to} onClick={() => setOpen(false)}>
                        {i.label}
                      </MobileLink>
                    )),
                  )}
                </MobileSection>
              )}

              {visibleTipoGroups.length > 0 && (
                <MobileSection
                  label="Tipos de bebida"
                  id="tipos"
                  open={mobileTab === "tipos"}
                  onToggle={() => setMobileTab(mobileTab === "tipos" ? null : "tipos")}
                >
                  {visibleTipoGroups.map((group) => (
                    <div key={group.label} className="mb-3 last:mb-0">
                      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">
                        {group.label}
                      </p>
                      {group.items.map((i) => (
                        <MobileLink key={i.to} to={i.to} onClick={() => setOpen(false)}>
                          {i.label}
                        </MobileLink>
                      ))}
                    </div>
                  ))}
                </MobileSection>
              )}

              {visibleCombosGroups.length > 0 && (
                <MobileSection
                  label="Combos"
                  id="combos"
                  open={mobileTab === "combos"}
                  onToggle={() => setMobileTab(mobileTab === "combos" ? null : "combos")}
                >
                  {visibleCombosGroups.flatMap((group) =>
                    group.items.map((i) => (
                      <MobileLink key={i.to} to={i.to} onClick={() => setOpen(false)}>
                        {i.label}
                      </MobileLink>
                    )),
                  )}
                </MobileSection>
              )}

              {countries.length > 0 && (
                <MobileSection
                  label="Países"
                  id="paises"
                  open={mobileTab === "paises"}
                  onToggle={() => setMobileTab(mobileTab === "paises" ? null : "paises")}
                >
                  <div className="grid grid-cols-2 gap-1">
                    {countries.map((c) => (
                      <Link
                        key={c.slug}
                        to="/colecao/$slug"
                        params={{ slug: c.slug }}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-2 py-2 text-xs transition-colors hover:text-primary"
                      >
                        <Flag cc={c.cc} alt={c.label} className="h-4 w-6" /> {c.label}
                      </Link>
                    ))}
                  </div>
                </MobileSection>
              )}

              <div className="mt-5 grid gap-2 border-t border-border pt-5">
                <DrawerAction
                  to="/rastreio"
                  icon={<PackageSearch />}
                  onClick={() => setOpen(false)}
                >
                  Rastrear pedido
                </DrawerAction>
                <DrawerAction to="/fale-conosco" icon={<Mail />} onClick={() => setOpen(false)}>
                  Fale conosco
                </DrawerAction>
                <DrawerAction to="/favoritos" icon={<Heart />} onClick={() => setOpen(false)}>
                  Meus favoritos
                </DrawerAction>
                <DrawerAction to={accountHref} icon={<User />} onClick={() => setOpen(false)}>
                  {accountLabel}
                </DrawerAction>
                <DrawerAction to="/minha-conta" icon={<Package />} onClick={() => setOpen(false)}>
                  Meus pedidos
                </DrawerAction>
              </div>
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}

function HeaderSearchForm({
  autoFocus = false,
  onSubmit,
}: {
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        navigate({ to: "/busca", search: { q: query || undefined } });
        onSubmit?.();
      }}
      role="search"
      className="group relative flex h-11 w-full items-center border-b border-foreground/25 transition-colors focus-within:border-primary"
    >
      <Search className="ml-3.5 h-[18px] w-[18px] shrink-0 text-muted-foreground transition group-focus-within:text-primary" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busque por vinho, país ou uva"
        aria-label="Pesquisar produtos"
        autoFocus={autoFocus}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground/80 md:text-sm"
      />
      <button
        type="submit"
        className="inline-flex h-9 shrink-0 items-center justify-center px-3 text-[11px] font-semibold uppercase tracking-wider text-primary transition-colors hover:text-foreground"
        aria-label="Buscar"
      >
        Buscar
      </button>
    </form>
  );
}

function DesktopNavMenu({
  id,
  label,
  open,
  onToggle,
  onNavigate,
  groups,
  wide = false,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  groups: Group[];
  wide?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`desktop-${id}-menu`}
        className={`flex items-center gap-1 px-2.5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
          open ? "text-primary" : "text-foreground hover:text-primary"
        }`}
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={`desktop-${id}-menu`}
          className={`absolute left-0 top-full z-50 mt-1 bg-background p-5 shadow-[0_14px_30px_rgba(34,16,18,0.13)] ${
            wide ? "w-[520px]" : "w-64"
          }`}
        >
          <div className={wide ? "grid grid-cols-2 gap-8" : "space-y-5"}>
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  {group.label}
                </h2>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <Link
                        to="/colecao/$slug"
                        params={{ slug: item.to.replace("/colecao/", "") }}
                        onClick={onNavigate}
                        className="block py-1.5 text-sm text-foreground transition-colors hover:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DesktopCountriesMenu({
  open,
  onToggle,
  onNavigate,
  countries,
}: {
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  countries: Country[];
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="desktop-paises-menu"
        className={`flex items-center gap-1 px-2.5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
          open ? "text-primary" : "text-foreground hover:text-primary"
        }`}
      >
        Países
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id="desktop-paises-menu"
          className="absolute left-0 top-full z-50 mt-1 w-[500px] bg-background p-5 shadow-[0_14px_30px_rgba(34,16,18,0.13)]"
        >
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            Selecione a origem
          </h2>
          {countries.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-5 gap-y-1">
              {countries.map((country) => (
                <Link
                  key={country.slug}
                  to="/colecao/$slug"
                  params={{ slug: country.slug }}
                  onClick={onNavigate}
                  className="flex items-center gap-2 py-1.5 text-xs text-foreground transition-colors hover:text-primary"
                >
                  <Flag cc={country.cc} alt={country.label} className="h-4 w-6" />
                  {country.label}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Carregando países disponíveis...</p>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderAction({
  to,
  label,
  icon,
  className = "",
  count,
  onClick,
}: {
  to: HeaderStaticRoute;
  label: string;
  icon: React.ReactNode;
  className?: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative h-9 w-9 items-center justify-center text-foreground transition-colors hover:text-primary sm:h-10 sm:w-10 ${className}`}
      aria-label={label}
      title={label}
    >
      <span className="[&>svg]:h-[21px] [&>svg]:w-[21px] [&>svg]:stroke-[1.7]">{icon}</span>
      {typeof count === "number" && count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}

function DrawerAction({
  to,
  icon,
  onClick,
  children,
}: {
  to: HeaderStaticRoute;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-1 py-2.5 text-sm text-foreground transition-colors hover:text-primary"
    >
      <span className="grid h-8 w-8 place-items-center text-primary [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      {children}
    </Link>
  );
}

function MobileSection({
  label,
  id,
  open,
  onToggle,
  children,
}: {
  label: string;
  id: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/80">
      <button
        type="button"
        onClick={onToggle}
        aria-controls={id}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-1 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-foreground transition hover:text-primary"
      >
        {label}
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180 text-primary" : ""}`}
        />
      </button>
      {open && (
        <div id={id} className="animate-in pb-3 fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

function MobileLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const slug = to.replace("/colecao/", "");

  return (
    <Link
      to="/colecao/$slug"
      params={{ slug }}
      onClick={onClick}
      className="block rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-cream hover:text-primary"
    >
      {children}
    </Link>
  );
}
