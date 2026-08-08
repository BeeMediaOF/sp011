import React, { useState } from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube, FaTiktok, FaWhatsapp, FaLinkedin } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useSite } from "../hooks/useSite";
import { useT } from "../lib/i18n";
import { trackNewsletter } from "../hooks/useAnalytics";
import { subscribeNewsletter } from "../lib/newsletter";
import { siteAssetUrl, siteAssetSrcSet } from "../lib/newsImage";
import {
  resolveFooterConfig, type FooterLink, type FooterSocialKey, type ResolvedFooter,
} from "../lib/footerConfig";

const SOCIAL_ICONS: Record<FooterSocialKey, React.ElementType> = {
  instagram: FaInstagram, facebook: FaFacebook, x: FaXTwitter,
  youtube: FaYoutube, tiktok: FaTiktok, whatsapp: FaWhatsapp, linkedin: FaLinkedin,
};

// Link interno via wouter (SPA); externo abre em nova aba.
function FooterAnchor({ href, className, children }: {
  href: string; className?: string; children: React.ReactNode;
}) {
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
  }
  return <Link href={href || "/"} className={className}>{children}</Link>;
}

function SocialIcons({ social, className }: {
  social: ResolvedFooter["social"]; className: string;
}) {
  return (
    <div className="flex gap-2">
      {social.map(({ key, href }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a key={key} href={href} aria-label={key} target="_blank" rel="noopener noreferrer" className={className}>
            <Icon size={16} />
          </a>
        );
      })}
    </div>
  );
}

/** Formulário de newsletter funcional (PRD-NEWSLETTER-01 RF1). A INSCRIÇÃO
 *  (subscribeNewsletter) é consentimento próprio de marketing e sai SEMPRE, fora
 *  do gate de cookies de analytics; a MÉTRICA (trackNewsletter) segue atrás do
 *  gate, em paralelo. Fire-and-forget: mostra "ok" após validar o e-mail. */
function NewsletterForm({ dark, accent }: { dark: boolean; accent: string }) {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok">("idle");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    subscribeNewsletter(v, "footer"); // inscrição (fora do gate de analytics)
    trackNewsletter(v);               // métrica (dentro do gate)
    setStatus("ok");
    setEmail("");
  }

  if (status === "ok") {
    return <p className={`text-xs font-bold ${dark ? "text-white" : "text-gray-800"}`}>{t("newsletter.thanks")}</p>;
  }
  return (
    <form onSubmit={submit} className="flex max-w-[320px]">
      <input type="email" placeholder={t("newsletter.email")} required value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label={t("newsletter.emailAria")}
        className={dark
          ? "flex-1 min-w-0 bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
          : "flex-1 min-w-0 bg-white border border-gray-300 text-gray-800 placeholder-gray-400 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"} />
      <button type="submit" disabled={status === "sending"}
        className={`text-xs font-bold px-4 py-2 transition-colors disabled:opacity-60 ${dark ? "text-black hover:opacity-90" : "text-white hover:opacity-90"}`}
        style={{ backgroundColor: accent }}>
        {status === "sending" ? "…" : "OK"}
      </button>
    </form>
  );
}

function LegalRow({ links, className, sepClassName }: {
  links: FooterLink[]; className: string; sepClassName: string;
}) {
  return (
    <div className="flex gap-3 flex-wrap">
      {links.map((l, i) => (
        <React.Fragment key={l.id}>
          {i > 0 && <span className={sepClassName}>|</span>}
          <FooterAnchor href={l.href} className={className}>{l.label}</FooterAnchor>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Logo do rodapé; sem imagem, o nome do site em texto; sem nome, só o espaço. */
function FooterBrand({ src, name, height }: { src: string; name: string; height: number }) {
  if (src) {
    return (
      <img src={siteAssetUrl(src, { h: height })} srcSet={siteAssetSrcSet(src, { h: height })}
        alt={name} style={{ height }} loading="lazy" decoding="async"
        className="w-auto max-w-[min(70vw,320px)] object-contain mb-2" />
    );
  }
  if (name) {
    return (
      <span className="block mb-2 font-black tracking-tight leading-none"
        style={{ fontSize: Math.max(16, Math.round(height * 0.5)) }}>{name}</span>
    );
  }
  return <span className="block mb-2" style={{ height }} />;
}

export default function Footer() {
  const { settings } = useSite();
  const { t, lang } = useT();
  const style = settings?.footerStyle ?? "dark";
  const bgColor = settings?.footerBgColor;
  // Logo própria do rodapé (painel → Logo & Imagens) tem prioridade; depois a
  // logo principal. SEM as imagens do bundle como reserva: elas são a marca de
  // outro portal da rede, e o rodapé de um blog sem logo as exibia como se
  // fossem dele. Sem logo, o rodapé cai no nome do site (ver abaixo).
  const logoSrc      = settings?.footerLogoBase64 || settings?.logoBase64 || "";
  const logoColorSrc = logoSrc;
  // Altura configurável no editor do rodapé (padrão 40px = o antigo h-10). A
  // largura tem teto para uma logo larga em tamanho grande não estourar a
  // coluna no celular (object-contain mantém a proporção dentro do teto).
  const logoH = settings?.footerLogoSize && settings.footerLogoSize > 0
    ? Math.min(settings.footerLogoSize, 160) : 40;

  // Conteúdo 100% editável no painel (aba Rodapé); defaults = contato + menu.
  const f = resolveFooterConfig({
    config: settings?.footerConfig,
    contact: settings?.contact,
    menuItems: settings?.menuItems,
    siteName: settings?.siteName ?? "",
    tagline: settings?.tagline,
    lang,
  });

  // ── Minimal ────────────────────────────────────────────────────────────────
  if (style === "minimal") {
    const firstColumnLinks = f.columns[0]?.links.slice(0, 5) ?? [];
    return (
      <footer className="border-t border-gray-200 py-4"
        style={{ backgroundColor: bgColor ?? "#f3f4f6" }}>
        <div className="max-w-[1280px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <p>{settings ? f.copyright : ""}</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {firstColumnLinks.map((l) => (
              <FooterAnchor key={l.id} href={l.href} className="hover:text-gray-800 transition-colors">{l.label}</FooterAnchor>
            ))}
          </div>
          {f.showSocial && (
            <SocialIcons social={f.social}
              className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors" />
          )}
        </div>
      </footer>
    );
  }

  // ── Light ─────────────────────────────────────────────────────────────────
  // Acento configurável (borda superior, títulos das colunas e botão da
  // newsletter) — ausente = vermelho original.
  if (style === "light") {
    const lightAccent = settings?.footerAccentColor || "#c8102e";
    return (
      <footer className="border-t-4 pt-8 pb-5"
        style={{ backgroundColor: bgColor ?? "#f9fafb", borderTopColor: lightAccent }}>
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
            <div>
              <FooterBrand src={logoColorSrc} name={settings?.siteName || ""} height={logoH} />
              {f.description && (
                <p className="text-gray-600 text-xs leading-relaxed max-w-[280px]">{f.description}</p>
              )}
            </div>
            {f.showSocial && (
              <SocialIcons social={f.social}
                className="w-9 h-9 bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors" />
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {f.columns.map((col) => (
              <div key={col.id}>
                <h3 className="font-bold mb-3 uppercase text-xs tracking-wider" style={{ color: lightAccent }}>{col.title}</h3>
                <ul className="flex flex-col gap-1.5 text-xs text-gray-600">
                  {col.links.map((l) => (
                    <li key={l.id}><FooterAnchor href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</FooterAnchor></li>
                  ))}
                </ul>
              </div>
            ))}

            {(f.showContact || f.showNewsletter) && (
              <div className="col-span-2">
                <h3 className="font-bold mb-3 uppercase text-xs tracking-wider" style={{ color: lightAccent }}>
                  {f.showContact && f.showNewsletter ? t("footer.contactNewsletter") : f.showContact ? t("footer.contact") : t("footer.newsletter")}
                </h3>
                {f.showContact && (
                  <div className="text-gray-600 text-xs space-y-1 mb-4">
                    {f.phone && <p className="text-gray-800 font-bold">{f.phone}</p>}
                    {f.email && <p>{f.email}</p>}
                  </div>
                )}
                {f.showNewsletter && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-600">{f.newsletterTitle}</p>
                    <NewsletterForm dark={false} accent={lightAccent} />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-600">
            <p>{settings ? f.copyright : ""}</p>
            <LegalRow links={f.legalLinks} className="hover:text-gray-900 transition-colors" sepClassName="text-gray-400" />
          </div>
        </div>
      </footer>
    );
  }

  // ── Dark (default) ────────────────────────────────────────────────────────
  // Cor de acento configurável (borda superior, títulos das colunas e botão da
  // newsletter); ausente = cores originais douradas.
  const accent = settings?.footerAccentColor || undefined;
  // A frio (settings===null) não pinta o dourado de marca SBC nos acentos do
  // rodapé dark; usa neutros até /api/site responder.
  const accentBorder = settings ? (accent ?? "#c89110") : "rgba(255,255,255,0.12)";
  const accentTitle  = settings ? (accent ?? "#ffd300") : "#e5e7eb";
  return (
    <footer className="text-white pt-8 pb-5 border-t-[4px]"
      style={{ backgroundColor: bgColor ?? "#000000", borderTopColor: accentBorder }}>
      <div className="max-w-[1280px] mx-auto px-4">

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-white/10">
          <div>
            <FooterBrand src={logoSrc} name={settings?.siteName || ""} height={logoH} />
            {f.description && (
              <p className="text-gray-400 text-xs leading-relaxed max-w-[280px]">{f.description}</p>
            )}
          </div>
          {f.showSocial && (
            <SocialIcons social={f.social}
              className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors" />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {f.columns.map((col) => (
            <div key={col.id}>
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider" style={{ color: accentTitle }}>{col.title}</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-gray-400">
                {col.links.map((l) => (
                  <li key={l.id}><FooterAnchor href={l.href} className="hover:text-white transition-colors">{l.label}</FooterAnchor></li>
                ))}
              </ul>
            </div>
          ))}

          {(f.showContact || f.showNewsletter) && (
            <div className="col-span-2 md:col-span-2">
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider" style={{ color: accentTitle }}>
                {f.showContact && f.showNewsletter ? t("footer.contactNewsletter") : f.showContact ? t("footer.contact") : t("footer.newsletter")}
              </h3>
              {f.showContact && (
                <div className="text-gray-400 text-xs space-y-1 mb-4">
                  {f.phone && <p className="text-white font-bold">{f.phone}</p>}
                  {f.email && <p>{f.email}</p>}
                </div>
              )}
              {f.showNewsletter && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-400">{f.newsletterTitle}</p>
                  <NewsletterForm dark accent={accentTitle} />
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-400">
          <p>{settings ? f.copyright : ""}</p>
          <LegalRow links={f.legalLinks} className="hover:text-white transition-colors" sepClassName="text-gray-700" />
        </div>

      </div>
    </footer>
  );
}
