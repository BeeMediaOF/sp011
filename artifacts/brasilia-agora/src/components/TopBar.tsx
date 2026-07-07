/**
 * Barra utilitária acima do cabeçalho: data por extenso + manchete mais
 * recente ("Trending") + ícones das redes sociais.
 *
 * Desligada por padrão — só renderiza quando settings.showTopBar está ativo
 * (painel → Blocos da Home → Cabeçalho), então o layout clássico não muda.
 * Montada em todas as páginas acima do <Header/>.
 */
import React from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useSite } from "../hooks/useSite";
import { useT, formatLongDate } from "../lib/i18n";
import { useArticles } from "../hooks/useArticles";
import { safeTitleHtml } from "../lib/sanitize";
import { resolveFooterConfig, type FooterSocialKey } from "../lib/footerConfig";

const SOCIAL_ICONS: Record<FooterSocialKey, React.ElementType> = {
  instagram: FaInstagram, facebook: FaFacebook, x: FaXTwitter,
  youtube: FaYoutube, tiktok: FaTiktok, whatsapp: FaWhatsapp,
};

export default function TopBar() {
  const { settings } = useSite();
  if (!settings?.showTopBar) return null;
  // Componente interno: o fetch de artigos só acontece com a barra ligada.
  return <TopBarInner />;
}

function TopBarInner() {
  const { settings } = useSite();
  const { lang, tz } = useT();
  const { articles } = useArticles();

  const top = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )[0];
  const accent = settings?.menuActiveColor || "#c8102e";
  const social = resolveFooterConfig({
    config: settings?.footerConfig,
    contact: settings?.contact,
    menuItems: settings?.menuItems,
    siteName: settings?.siteName,
    tagline: settings?.tagline,
  }).social;
  const dateStr = formatLongDate(new Date(), lang, tz);

  return (
    <div style={{ backgroundColor: settings?.topBarBgColor || "#0b0d0c" }}>
      <div className="max-w-[1280px] mx-auto px-4 h-9 flex items-center gap-3 text-white">
        <span suppressHydrationWarning
          className="hidden sm:block text-[11px] text-white/70 capitalize shrink-0">
          {dateStr}
        </span>
        {top ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0"
              style={{ backgroundColor: accent }}>
              Trending
            </span>
            <Link href={`/artigo/${top.slug || top.id}`}
              className="min-w-0 text-[12px] font-semibold text-white/90 hover:text-white truncate"
              dangerouslySetInnerHTML={{ __html: safeTitleHtml(top.title) }} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {social.length > 0 && (
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {social.map(({ key, href }) => {
              const Icon = SOCIAL_ICONS[key];
              return (
                <a key={key} href={href} aria-label={key} target="_blank" rel="noopener noreferrer"
                  className="w-6 h-6 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                  <Icon size={13} />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
