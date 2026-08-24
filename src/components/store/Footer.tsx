import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin, Instagram, Facebook } from "lucide-react";

import { useStoreSettings } from "@/lib/store-settings";
import { STORE } from "@/lib/settings";
import { mailtoHref, telHref } from "@/lib/contact-links";
import { toSiteImageUrl, toTransformedImageUrl } from "@/lib/image-url";
import { NewsletterForm } from "@/components/store/NewsletterForm";
import { StoreContainer } from "@/components/store/StoreContainer";

export function Footer() {
  const { data: settings } = useStoreSettings();
  const f = settings?.footer;
  if (!f) {
    return <footer data-site-footer className="mt-16 min-h-[32rem] bg-[#090909]" aria-hidden />;
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

  return (
    <footer data-site-footer className="mt-16 bg-[#090909] text-white">
      <StoreContainer>
        <NewsletterForm title={f.newsletterTitle} />

        <div
          className={`grid gap-x-8 gap-y-12 border-t border-white/15 py-12 sm:grid-cols-2 lg:py-16 ${
            hasCategories ? "lg:grid-cols-5" : "lg:grid-cols-4"
          }`}
        >
          <div>
            <div className="flex h-14 items-center" style={{ height: f.logoMaxHeight || 56 }}>
              <img
                src={
                  f.logoUrl
                    ? toTransformedImageUrl(toSiteImageUrl(f.logoUrl), {
                        width: 280,
                        quality: 70,
                        format: "webp",
                        resize: "contain",
                      }) || toSiteImageUrl(f.logoUrl)
                    : "/assets/favicon.png"
                }
                alt={STORE.name}
                width={112}
                height={56}
                loading="lazy"
                decoding="async"
                className="h-full w-auto max-h-full object-contain"
              />
            </div>
            <p className="mt-5 text-sm leading-6 text-white/70">{aboutText}</p>
            {(hasInstagram || hasFacebook) && (
              <div className="mt-6 flex items-center gap-3">
                {hasInstagram && (
                  <a
                    href={f.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/80 hover:border-white/50 hover:text-white"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-[18px] w-[18px]" />
                  </a>
                )}
                {hasFacebook && (
                  <a
                    href={f.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white/80 hover:border-white/50 hover:text-white"
                    aria-label="Facebook"
                  >
                    <Facebook className="h-[18px] w-[18px]" />
                  </a>
                )}
              </div>
            )}
          </div>

          {hasCategories && (
            <div>
              <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                {f.categoriesTitle}
              </h4>
              <ul className="space-y-3 text-sm text-white/70">
                {f.categories.map((c, i) => (
                  <li key={i}>
                    {isExternal(c.href) ? (
                      <a href={c.href} className="hover:text-white">
                        {c.label}
                      </a>
                    ) : (
                      <Link to={c.href} className="hover:text-white">
                        {c.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {f.institutionalTitle}
            </h4>
            <ul className="space-y-3 text-sm text-white/70">
              {f.institutional
                .filter((p) => p.slug !== "quem-somos")
                .map((p) => (
                  <li key={p.id}>
                    <Link to="/politicas/$slug" params={{ slug: p.slug }} className="hover:text-white">
                      {p.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              Área do Cliente
            </h4>
            <ul className="space-y-3 text-sm text-white/70">
              <li>
                <Link to="/fale-conosco" className="hover:text-white">
                  Fale conosco
                </Link>
              </li>
              <li>
                <Link to="/rastreio" className="hover:text-white">
                  Rastrear Pedido
                </Link>
              </li>
              <li>
                <Link to="/quem-somos" className="hover:text-white">
                  Quem somos
                </Link>
              </li>
            </ul>
          </div>

          <div className="min-w-0">
            <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              Contato
            </h4>
            <ul className="space-y-4 text-sm leading-6 text-white/70">
              {f.address && (
                <li className="flex items-start gap-3">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#d6b36a]" />
                  <span className="min-w-0 text-pretty">{f.address}</span>
                </li>
              )}
              {f.phone && (() => {
                const href = telHref(f.phone);
                return (
                  <li className="flex items-start gap-3">
                    <Phone className="mt-1 h-4 w-4 shrink-0 text-[#d6b36a]" />
                    {href ? (
                      <a href={href} className="whitespace-nowrap hover:text-white">
                        {f.phone}
                      </a>
                    ) : (
                      <span className="whitespace-nowrap">{f.phone}</span>
                    )}
                  </li>
                );
              })()}
              {f.email && (
                <li className="flex items-start gap-3">
                  <Mail className="mt-1 h-4 w-4 shrink-0 text-[#d6b36a]" />
                  <a
                    href={mailtoHref(f.email) ?? `mailto:${f.email}`}
                    className="min-w-0 break-words [overflow-wrap:anywhere] hover:text-white"
                  >
                    {f.email}
                  </a>
                </li>
              )}
              <li className="text-sm text-pretty">
                <b className="font-semibold text-white/90">Horário de atendimento:</b> Segunda a
                Sexta-feira das 08:00hrs às 18:00hrs
              </li>
            </ul>
          </div>
        </div>

        {f.securityBadges && f.securityBadges.length > 0 && (
          <div className="border-t border-white/15 py-7">
            {f.securityBadgesTitle && (
              <div className="mb-4 text-center text-[11px] uppercase tracking-[0.2em] text-white/60">
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
                    className="w-auto object-contain opacity-80 hover:opacity-100"
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
          </div>
        )}

        <div className="border-t border-white/15 py-6 text-center text-xs text-white/55">
          {copyright}
        </div>
      </StoreContainer>
    </footer>
  );
}
