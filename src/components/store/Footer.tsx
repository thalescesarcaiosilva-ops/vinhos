import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin, Instagram, Facebook, Clock, ArrowRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { useStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { mailtoHref, telHref } from "@/lib/contact-links";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { StoreContainer } from "@/components/store/StoreContainer";
import { cn } from "@/lib/utils";

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="font-serif text-[13px] font-bold uppercase tracking-[0.14em] text-primary">
        {children}
      </h4>
      <span className="mt-2 block h-px w-10 bg-[#d6b36a]" aria-hidden />
    </div>
  );
}

function FooterNavLink({
  children,
  className,
  ...props
}: ComponentProps<"a"> & { children: ReactNode }) {
  return (
    <a
      {...props}
      className={cn(
        "block border-b border-neutral-100 py-2.5 text-sm text-neutral-600 transition last:border-b-0 hover:border-primary/30 hover:text-primary",
        className,
      )}
    >
      {children}
    </a>
  );
}

export function Footer() {
  const { data: settings } = useStoreSettings();
  const f = settings?.footer;
  if (!f) {
    return <footer data-site-footer className="mt-16 min-h-[32rem] bg-white" aria-hidden />;
  }
  const year = new Date().getFullYear();
  const copyright = f.copyrightText.replace("{year}", String(year));
  const isExternal = (href: string) => /^https?:\/\//i.test(href);

  const hasInstagram = !!f.instagramUrl && f.instagramUrl.trim() !== "";
  const hasFacebook = !!f.facebookUrl && f.facebookUrl.trim() !== "";
  const hasCategories = f.categories.length > 0;
  const aboutText =
    f.aboutText?.trim() ||
    "A Galvao Vinhos é uma loja especializada em vinhos e espumantes selecionados, com curadoria cuidadosa, compra segura e atendimento próximo.";

  const logoMaxHeight = settings?.brand?.logoMaxHeight || f.logoMaxHeight || 56;
  const logoSrc = settings?.brand?.logoUrl
    ? toTransformedImageUrl(toSiteImageUrl(settings.brand.logoUrl), {
        width: 280,
        quality: 80,
        format: "webp",
        resize: "contain",
      }) || toSiteImageUrl(settings.brand.logoUrl)
    : "/assets/favicon.png";

  const phone = f.phone || STORE.phone;
  const columnClass =
    "border-t border-neutral-200 pt-8 lg:border-t-0 lg:border-l lg:border-neutral-200 lg:pt-0 lg:pl-8";

  return (
    <footer data-site-footer className="mt-16 bg-white text-foreground">
      <StoreContainer className="pt-10 lg:pt-12">
        <NewsletterForm title={f.newsletterTitle} />

        <div
          className={cn(
            "mt-10 grid gap-y-10 border-y border-neutral-200 py-12 sm:grid-cols-2 lg:mt-12 lg:gap-x-0 lg:py-14",
            hasCategories ? "lg:grid-cols-5" : "lg:grid-cols-4",
          )}
        >
          <div className="lg:pr-8">
            <div className="flex items-center" style={{ height: logoMaxHeight }}>
              <img
                src={logoSrc}
                alt={STORE.name}
                width={112}
                height={logoMaxHeight}
                loading="lazy"
                decoding="async"
                className="h-full w-auto max-h-full object-contain"
              />
            </div>
            <p className="mt-5 text-sm leading-6 text-neutral-600">{aboutText}</p>
            <Link
              to="/quem-somos"
              className="mt-5 inline-flex items-center gap-2 border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary transition hover:bg-primary hover:text-primary-foreground"
            >
              Quem somos
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            {(hasInstagram || hasFacebook) && (
              <div className="mt-6 flex items-center gap-4">
                {hasInstagram && (
                  <a
                    href={f.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-500 transition hover:text-primary"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
                {hasFacebook && (
                  <a
                    href={f.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-500 transition hover:text-primary"
                    aria-label="Facebook"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {hasCategories && (
            <div className={columnClass}>
              <FooterHeading>{f.categoriesTitle}</FooterHeading>
              <nav aria-label={f.categoriesTitle}>
                {f.categories.map((c, i) =>
                  isExternal(c.href) ? (
                    <FooterNavLink key={i} href={c.href}>
                      {c.label}
                    </FooterNavLink>
                  ) : (
                    <Link
                      key={i}
                      to={c.href}
                      className="block border-b border-neutral-100 py-2.5 text-sm text-neutral-600 transition last:border-b-0 hover:border-primary/30 hover:text-primary"
                    >
                      {c.label}
                    </Link>
                  ),
                )}
              </nav>
            </div>
          )}

          <div className={columnClass}>
            <FooterHeading>{f.institutionalTitle}</FooterHeading>
            <nav aria-label={f.institutionalTitle}>
              {f.institutional
                .filter((p) => p.slug !== "quem-somos")
                .map((p) => (
                  <Link
                    key={p.id}
                    to="/politicas/$slug"
                    params={{ slug: p.slug }}
                    className="block border-b border-neutral-100 py-2.5 text-sm text-neutral-600 transition last:border-b-0 hover:border-primary/30 hover:text-primary"
                  >
                    {p.label}
                  </Link>
                ))}
            </nav>
          </div>

          <div className={columnClass}>
            <FooterHeading>Área do Cliente</FooterHeading>
            <nav aria-label="Área do Cliente">
              <Link
                to="/fale-conosco"
                className="block border-b border-neutral-100 py-2.5 text-sm text-neutral-600 transition hover:border-primary/30 hover:text-primary"
              >
                Fale conosco
              </Link>
              <Link
                to="/rastreio"
                className="block border-b border-neutral-100 py-2.5 text-sm text-neutral-600 transition last:border-b-0 hover:border-primary/30 hover:text-primary"
              >
                Rastrear Pedido
              </Link>
            </nav>
          </div>

          <div className={cn(columnClass, "min-w-0")}>
            <FooterHeading>Contato</FooterHeading>
            <ul className="space-y-5 text-sm text-neutral-600">
              {f.address && (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 leading-6 text-pretty">{f.address}</span>
                </li>
              )}
              {phone && (
                <li>
                  <a
                    href={telHref(phone) ?? `tel:+55${STORE.phoneDigits}`}
                    className="flex items-center gap-3 transition hover:text-primary"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{phone}</span>
                  </a>
                </li>
              )}
              {f.email && (
                <li>
                  <a
                    href={mailtoHref(f.email) ?? `mailto:${f.email}`}
                    className="flex items-start gap-3 transition hover:text-primary"
                  >
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 break-all">{f.email}</span>
                  </a>
                </li>
              )}
              <li className="flex gap-3 border-t border-neutral-100 pt-5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="leading-6">
                  Segunda a Sexta-feira
                  <br />
                  08:00 às 18:00
                </span>
              </li>
            </ul>
          </div>
        </div>
      </StoreContainer>

      {f.securityBadges && f.securityBadges.length > 0 && (
        <div className="bg-black py-7">
          <StoreContainer>
            {f.securityBadgesTitle && (
              <div className="mb-4 text-center text-[11px] uppercase tracking-[0.2em] text-white/70">
                {f.securityBadgesTitle}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {f.securityBadges.map((b) => {
                const h = Number(b.height) || 60;
                const img = (
                  <img
                    src={
                      toTransformedImageUrl(toSiteImageUrl(b.imageUrl), {
                        width: 350,
                        quality: 80,
                        format: "webp",
                        resize: "contain",
                      }) || toSiteImageUrl(b.imageUrl)
                    }
                    alt={b.alt || "Selo de segurança"}
                    loading="lazy"
                    decoding="async"
                    style={{ height: b.height }}
                    height={h}
                    className="w-auto object-contain opacity-90 hover:opacity-100"
                  />
                );
                return b.href ? (
                  <a
                    key={b.id}
                    href={b.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block"
                  >
                    {img}
                  </a>
                ) : (
                  <span key={b.id} className="inline-block">
                    {img}
                  </span>
                );
              })}
            </div>
          </StoreContainer>
        </div>
      )}

      <StoreContainer>
        <div className="py-6 text-center text-xs text-neutral-500">{copyright}</div>
      </StoreContainer>
    </footer>
  );
}
