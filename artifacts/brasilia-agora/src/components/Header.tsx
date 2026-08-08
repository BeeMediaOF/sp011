import React, { useState, useEffect } from "react";
import { BRAND } from "../brand";
import { Link, useLocation } from "wouter";
import { Menu, X, House, ChevronDown } from "lucide-react";
import { useSite } from "../hooks/useSite";
import HeaderSearch from "./HeaderSearch";
import OverflowNav from "./OverflowNav";
import { useT } from "../lib/i18n";
import { trackSearch } from "../hooks/useAnalytics";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { isDarkBg, inkOn } from "@/lib/colorContrast";
import { safeLinkUrl } from "../lib/homeBlocks";
import { useAdImpression, trackClick } from "./ads/useAds";
import PushSubscribeButton from "./PushSubscribeButton";
import logoImg from "../assets/images/logo_sbc_agora.png";
import { siteAssetUrl, siteAssetSrcSet } from "../lib/newsImage";

const FALLBACK_NAV: NavEntry[] = [
  { label: "HOME",       path: "/" },
  { label: "POLÍTICA",   path: "/politica" },
  { label: "CIDADE",     path: "/cidade" },
  { label: "SEGURANÇA",  path: "/seguranca" },
  { label: "TRANSPORTE", path: "/transporte" },
  { label: "SAÚDE",      path: "/saude" },
  { label: "EDUCAÇÃO",   path: "/educacao" },
  { label: "CULTURA",    path: "/cultura" },
  { label: "ESPORTES",   path: "/esportes" },
  { label: "COLUNAS",    path: "/colunas" },
];

// Fallback quando o site é EN e o menu ainda não foi configurado no painel
// (mesmas rotas de categoria; num blog real o menu vem de settings.menuItems).
const FALLBACK_NAV_EN: NavEntry[] = [
  { label: "HOME",      path: "/" },
  { label: "POLITICS",  path: "/politica" },
  { label: "CITY",      path: "/cidade" },
  { label: "SECURITY",  path: "/seguranca" },
  { label: "TRANSPORT", path: "/transporte" },
  { label: "HEALTH",    path: "/saude" },
  { label: "EDUCATION", path: "/educacao" },
  { label: "CULTURE",   path: "/cultura" },
  { label: "SPORTS",    path: "/esportes" },
  { label: "COLUMNS",   path: "/colunas" },
];

// ─── Submenu (1 nível) ────────────────────────────────────────────────────────
/** Shape mínimo dos itens de navegação (settings.menuItems ou FALLBACK_NAV). */
type NavEntry = { label: string; path: string; visible?: boolean; children?: NavEntry[] };

function visibleChildren(item: NavEntry): NavEntry[] {
  return (item.children ?? []).filter((c) => c.visible !== false);
}

/** Painel dropdown aberto no hover/focus do item pai (desktop). */
function NavDropdown({ items }: { items: NavEntry[] }) {
  return (
    <div className="absolute left-0 top-full min-w-[190px] z-50 hidden group-hover:block group-focus-within:block bg-white border border-gray-200 shadow-lg rounded-b-lg overflow-hidden">
      {items.map((c) => (
        <Link key={c.path} href={c.path}
          className="block px-4 py-2.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-100">
          {c.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Ticker de cotações ───────────────────────────────────────────────────────
interface FxQuote   { bid: string; pctChange: string; }
interface QuotesData {
  fx:     { USDBRL?: FxQuote; EURBRL?: FxQuote; GBPBRL?: FxQuote };
  crypto: { BTCBRL?: FxQuote; ETHBRL?: FxQuote };
}

function TickerBar() {
  const [data, setData] = useState<QuotesData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/quotes").then(r => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const f2 = (v: string) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const f0 = (v: string) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const items = [
    { code: "USD", value: data?.fx?.USDBRL     ? f2(data.fx.USDBRL.bid)     : "—", pct: data?.fx?.USDBRL?.pctChange     ?? "0" },
    { code: "EUR", value: data?.fx?.EURBRL     ? f2(data.fx.EURBRL.bid)     : "—", pct: data?.fx?.EURBRL?.pctChange     ?? "0" },
    { code: "GBP", value: data?.fx?.GBPBRL     ? f2(data.fx.GBPBRL.bid)     : "—", pct: data?.fx?.GBPBRL?.pctChange     ?? "0" },
    { code: "BTC", value: data?.crypto?.BTCBRL ? f0(data.crypto.BTCBRL.bid) : "—", pct: data?.crypto?.BTCBRL?.pctChange ?? "0" },
    { code: "ETH", value: data?.crypto?.ETHBRL ? f0(data.crypto.ETHBRL.bid) : "—", pct: data?.crypto?.ETHBRL?.pctChange ?? "0" },
  ];

  /* Triplicamos para que o loop CSS pareça infinito */
  const track = [...items, ...items, ...items];

  return (
    /*
     * h-8 fixo → o ticker nunca muda de altura e não causa CLS.
     * A animação é 100% CSS (@keyframes), sem leitura de scrollWidth em JS.
     * Elimina o "reflow forçado" que o Lighthouse apontava no RAF anterior.
     */
    <div
      className="bg-gray-100 border-b border-gray-200 overflow-hidden select-none"
      style={{ height: 32 }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
      <div className="overflow-hidden h-full flex items-center">
        <div
          className="flex items-center gap-10 w-max"
          style={{ animation: "ticker-scroll 30s linear infinite" }}
        >
          {track.map(({ code, value, pct }, i) => {
            const val = parseFloat(pct);
            const up  = val >= 0;
            return (
              <span key={i} className="flex items-center gap-1.5 shrink-0 text-[11px]">
                <span className="font-bold text-gray-600 uppercase tracking-wider">{code}</span>
                <span className="text-gray-800 font-medium">{value}</span>
                <span className="font-bold" style={{ color: up ? "#15803d" : "#dc2626" }}>
                  {up ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Drawer de navegação mobile ───────────────────────────────────────────────
// Painel deslizante com backdrop, trava de scroll e fechar no ESC. Usado pelos
// três estilos de cabeçalho para garantir uma experiência consistente no celular.
interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  navItems: NavEntry[];
  isActive: (path: string) => boolean;
  activeColor: string;
  logoSrc: string;
  siteName: string;
}

function MobileNav({ open, onClose, navItems, isActive, activeColor, logoSrc, siteName }: MobileNavProps) {
  const { t } = useT();
  // Submenus abertos no drawer (acordeão por path do item pai).
  const [openSub, setOpenSub] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="lg:hidden" aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />
      {/* Painel deslizante */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("menu.nav")}
        className={`fixed top-0 left-0 z-50 h-full w-[84%] max-w-[330px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-gray-200 shrink-0">
          {/* h-7 = 28 px de altura (menu lateral do mobile). */}
          {logoSrc ? <img src={siteAssetUrl(logoSrc, { h: 28 })} srcSet={siteAssetSrcSet(logoSrc, { h: 28 })} alt={siteName} loading="lazy" decoding="async" className="h-7 w-auto object-contain" /> : <span className="h-7" />}
          <button onClick={onClose} aria-label={t("menu.close")} className="p-2 -mr-2 text-gray-500 hover:text-gray-900 rounded-lg transition-colors">
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const { label, path } = item;
              const active = isActive(path);
              const kids = visibleChildren(item);
              return (
                <li key={path}>
                  <div className="flex items-center">
                    <Link
                      href={path}
                      onClick={onClose}
                      className="flex-1 flex items-center gap-3 py-3 px-3 rounded-xl text-[15px] font-semibold transition-colors hover:bg-gray-50 active:bg-gray-100"
                      style={{ color: active ? activeColor : "#374151" }}
                    >
                      <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: active ? activeColor : "#e5e7eb" }} />
                      {label}
                    </Link>
                    {kids.length > 0 && (
                      <button
                        onClick={() => setOpenSub((p) => ({ ...p, [path]: !p[path] }))}
                        aria-label={openSub[path] ? t("menu.subClose") : t("menu.subOpen")}
                        className="p-2 mr-1 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
                      >
                        <ChevronDown size={16} className={`transition-transform ${openSub[path] ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                  {kids.length > 0 && openSub[path] && (
                    <ul className="pl-9 pb-1">
                      {kids.map((c) => (
                        <li key={c.path}>
                          <Link href={c.path} onClick={onClose}
                            className="block py-2 px-3 rounded-lg text-[14px] font-medium hover:bg-gray-50"
                            style={{ color: isActive(c.path) ? activeColor : "#4b5563" }}>
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>
  );
}

// ─── Logo do cabeçalho (desktop + mobile) ─────────────────────────────────────
// No mobile a altura ganha um teto automático (mobileCap) que o painel pode
// substituir com um tamanho próprio (logoMobileSize). A largura é limitada pelo
// PRÓPRIO espaço da linha do cabeçalho: o wrapper da logo (Link) recebe
// `min-w-0 shrink` no mobile e o <img> usa max-w-full — a logo cresce até onde
// há espaço real (sem o antigo teto fixo de 60vw, que travava logos largas) e
// nunca estoura a tela para o lado. Se houver logo mobile própria (versão
// vertical), ela substitui a principal só em telas pequenas. O desktop segue
// exatamente o logoSize configurado.
function HeaderLogo({ desktopSrc, mobileSrc, alt, height, mobileCap, mobileHeight, centered }: {
  desktopSrc: string; mobileSrc: string; alt: string; height: number; mobileCap: number;
  mobileHeight?: number; centered?: boolean;
}) {
  const mh = mobileHeight && mobileHeight > 0
    ? Math.min(mobileHeight, 120)
    : Math.min(height, mobileCap);
  // Settings ainda carregando (src vazio): reserva o espaço sem mostrar a logo
  // padrão embutida — num blog replicado ela é a marca errada (flash do sp011).
  if (!desktopSrc) {
    return (
      <>
        <span aria-hidden="true" className="lg:hidden block w-24" style={{ height: mh }} />
        <span aria-hidden="true" className="hidden lg:block w-24" style={{ height }} />
      </>
    );
  }
  // Quando a largura satura antes da altura (logo larga em tamanho grande), o
  // object-contain "encaixota" a arte: alinhada à esquerda junto ao menu nos
  // estilos standard/compact, centrada no estilo centered.
  return (
    <>
      {/* loading="lazy" aqui NÃO atrasa: a logo está dentro da viewport, e o
          navegador busca imagem lazy visível assim que calcula o layout. O que o
          atributo faz é impedir o React 19 de hoistear <link rel=preload as=image>
          para ela. Sem isso a logo disputa banda com a imagem do LCP por um ganho
          de poucos ms — ela já está no HTML do SSR no topo do <body>, então o
          parser a descobre de imediato. Vale duplamente porque são DUAS <img>
          (mobile e desktop): com logo mobile configurada, uma delas está sempre
          em display:none, e preload não respeita media query. */}
      <img src={siteAssetUrl(mobileSrc, { h: mh })} srcSet={siteAssetSrcSet(mobileSrc, { h: mh })} alt={alt} style={{ height: mh }}
        loading="lazy" decoding="async"
        className={`lg:hidden w-auto max-w-full object-contain block ${centered ? "" : "object-left"}`} />
      <img src={siteAssetUrl(desktopSrc, { h: height })} srcSet={siteAssetSrcSet(desktopSrc, { h: height })} alt={alt} style={{ height }}
        loading="lazy" decoding="async"
        className="hidden lg:block w-auto object-contain" />
    </>
  );
}

// ─── Header principal ─────────────────────────────────────────────────────────
export default function Header() {
  const { settings }            = useSite();
  const { t, lang }             = useT();
  // Logo configurada no painel (Configurações → logo) tem prioridade; a imagem
  // empacotada no bundle é só fallback quando nenhuma logo foi enviada.
  // Sem settings ainda (1º paint frio) o src fica vazio — o HeaderLogo reserva
  // o espaço em vez de mostrar a logo embutida (que é a marca do blog default).
  const logoSrc = settings ? (settings.logoBase64 || logoImg) : "";
  // Variante mobile opcional (Configurações → Logo & Imagens → Logo mobile).
  const logoMobileSrc = settings ? (settings.logoMobileBase64 || logoSrc) : "";
  const [location]              = useLocation();
  const [menuOpen, setMenu]       = useState(false);

  const [, navigate] = useLocation();

  // Dispara a busca (rastreio + navegação); o HeaderSearch fecha/limpa sozinho.
  function runSearch(q: string) {
    const v = q.trim();
    if (!v) return;
    trackSearch(v);
    navigate(`/arquivo?q=${encodeURIComponent(v)}`);
  }

  const style = settings?.headerStyle ?? "standard";

  const navItems =
    settings?.menuItems && settings.menuItems.length > 0
      ? settings.menuItems
      : (lang === "en" ? FALLBACK_NAV_EN : FALLBACK_NAV);

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location === path || location.startsWith(path + "/");

  const bgColor = settings?.headerBgColor ?? "#ffffff";
  const bgStyle = { backgroundColor: bgColor };

  // ── Estilo do menu (configurável no painel) ────────────────────────────────
  // Aplicado aos estilos "standard" e "compact" (fundo claro). O "centered" usa
  // uma barra escura própria e mantém seu esquema de cores.
  const menuTextColor   = settings?.menuTextColor   ?? "#6b7280"; // gray-500
  const menuActiveColor = settings?.menuActiveColor ?? "#c8102e";
  const menuFontSize    = settings?.menuFontSize    ?? 13;
  const menuFontWeight  = settings?.menuFontWeight  ?? 700;
  const navItemStyle = (path: string): React.CSSProperties => ({
    // Só pinta a cor de marca do item ativo depois que /api/site respondeu; a frio
    // (settings===null) o item ativo fica no cinza neutro do menu (sem flash do vermelho SBC).
    color: (isActive(path) && settings) ? menuActiveColor : menuTextColor,
    fontSize: menuFontSize,
    fontWeight: menuFontWeight,
  });

  // ── Margem lateral interna do cabeçalho (configurável no painel) ───────────
  // Evita que o conteúdo (logo, menu, ícones) fique colado nas bordas do site.
  const headerPadX = settings?.headerPaddingX ?? 16;
  const padStyle: React.CSSProperties = { paddingLeft: headerPadX, paddingRight: headerPadX };
  // Margem acima do cabeçalho (afasta-o do topo do site). Aplicada no wrapper.
  const headerMarginTop = settings?.headerMarginTop ?? 0;
  // Margem abaixo do cabeçalho (afasta-o do conteúdo). Mesmo wrapper.
  const headerMarginBottom = settings?.headerMarginBottom ?? 0;
  const wrapStyle: React.CSSProperties = { marginTop: headerMarginTop, marginBottom: headerMarginBottom };
  const siteName = settings?.siteName ?? BRAND.name;

  // ── Menu em faixa + banner do cabeçalho (opcionais; ausentes = layout atual) ─
  // "bar": a navegação sai da linha do logo e vira uma faixa colorida full-width
  // abaixo dela (estilo portal), com a busca dentro da própria faixa no desktop.
  const menuBarStyle: "attached" | "bar" = settings?.menuBarStyle === "bar" ? "bar" : "attached";
  const menuBarBg = settings?.menuBarBgColor || menuActiveColor;
  // Tinta das barras de menu: decidida pela luminância do fundo escolhido no
  // painel (antes era branco fixo — sumia quando a barra era clara).
  const barIsDark = isDarkBg(menuBarBg);
  const barInk = inkOn(menuBarBg, menuTextColor || "#101418");
  const centeredBarBg = settings?.menuBarBgColor || "#1a2448";
  const centeredBarIsDark = isDarkBg(centeredBarBg);
  const centeredInk = inkOn(centeredBarBg, menuTextColor || "#101418");
  // Overflow do menu (antes era flex-wrap/overflow-x-auto, que crescia em altura
  // ou sumia itens sem afordância): agora TODO nav desktop passa pelo OverflowNav,
  // que mede a largura disponível e joga o excedente num dropdown "Mais ▾". A
  // chave abaixo força a remedição quando muda o que altera a largura dos rótulos.
  const navRecomputeKey = `${menuFontSize}|${menuFontWeight}|${lang}|${navItems.length}`;
  const headerBannerClean = sanitizeArticleHtml(settings?.headerBannerHtml);
  // Link de redirecionamento do banner (painel → Cabeçalho ou aba Propagandas):
  // overlay que cobre o banner inteiro, sem aninhar <a> no HTML do usuário.
  const headerBannerLink = safeLinkUrl(settings?.headerBannerLinkUrl);
  // O banner do cabeçalho é inventário medido como os blocos-propaganda:
  // impressão viewável + clique sob a chave fixa block:header-banner.
  const headerBannerImpRef = useAdImpression(headerBannerClean ? "block:header-banner" : undefined);
  // No modo "bar" o banner preenche a linha do logo (flex-1); no "attached"
  // ele divide a linha com o menu — precisa abraçar o conteúdo (shrink-0),
  // senão disputa metade da largura com o nav e um sobrepõe o outro.
  const headerBanner = headerBannerClean ? (
    <div ref={headerBannerImpRef} data-bee-ad="1"
      className={`hidden lg:flex min-w-0 items-center justify-end relative ${menuBarStyle === "bar" ? "flex-1" : "shrink-0 ml-2"}`}
      style={{ minHeight: 48 }}>
      <div className="w-full min-w-0 flex items-center justify-end"
        dangerouslySetInnerHTML={{ __html: headerBannerClean }} />
      {headerBannerLink && (
        <a href={headerBannerLink} target="_blank" rel="noopener noreferrer sponsored"
          onClick={() => { void trackClick("block:header-banner"); }}
          className="absolute inset-0 z-10" aria-label={settings?.siteName ? `Banner — ${settings.siteName}` : "Banner"} />
      )}
    </div>
  ) : null;

  // ── Renderizadores de item por sítio de nav (passados ao OverflowNav) ───────
  // Cada estilo tem markup próprio do item; o OverflowNav só cuida da MEDIÇÃO e do
  // corte "Mais ▾". Item com submenu segue como grupo hover (NavDropdown), igual
  // antes. O OverflowNav aplica o espaçamento por `gap` no container, então os
  // itens NÃO carregam margem lateral (evita descasar da largura medida).
  const renderBarItem = (item: NavEntry) => {
    const { label, path } = item;
    const kids = visibleChildren(item);
    const link = (
      <Link
        href={path}
        style={{ fontSize: menuFontSize, fontWeight: menuFontWeight, color: barInk }}
        className={`flex items-center gap-1.5 px-4 py-2.5 uppercase tracking-wide whitespace-nowrap transition-colors ${isActive(path) ? (barIsDark ? "bg-black/25" : "bg-black/10") : (barIsDark ? "hover:bg-black/15" : "hover:bg-black/5")}`}
      >
        {path === "/" && <House size={13} className="shrink-0" />}
        {label}
        {kids.length > 0 && <ChevronDown size={11} className="shrink-0 opacity-70" />}
      </Link>
    );
    return kids.length > 0
      ? <div key={path} className="relative group flex items-stretch">{link}<NavDropdown items={kids} /></div>
      : <React.Fragment key={path}>{link}</React.Fragment>;
  };

  const renderAttachedItem = (itemPad: string) => (item: NavEntry) => {
    const { label, path } = item;
    const kids = visibleChildren(item);
    const link = (
      <Link
        href={path}
        style={navItemStyle(path)}
        className={`${itemPad} whitespace-nowrap transition-colors rounded-sm hover:bg-gray-100${kids.length > 0 ? " inline-flex items-center gap-1" : ""}`}
      >
        {label}
        {kids.length > 0 && <ChevronDown size={11} className="shrink-0 opacity-60" />}
      </Link>
    );
    return kids.length > 0
      ? <div key={path} className="relative group flex items-center">{link}<NavDropdown items={kids} /></div>
      : <React.Fragment key={path}>{link}</React.Fragment>;
  };

  const renderCenteredItem = (item: NavEntry) => {
    const { label, path } = item;
    const kids = visibleChildren(item);
    const link = (
      <Link
        href={path}
        style={{
          fontSize: menuFontSize,
          fontWeight: menuFontWeight,
          color: centeredInk,
          opacity: isActive(path) ? 1 : 0.8,
          borderBottom: isActive(path) ? `2px solid ${menuActiveColor}` : undefined,
        }}
        className={`px-4 py-2 whitespace-nowrap transition-colors hover:opacity-100 ${centeredBarIsDark ? "hover:bg-white/10" : "hover:bg-black/5"}${kids.length > 0 ? " inline-flex items-center gap-1" : ""}`}
      >
        {label}
        {kids.length > 0 && <ChevronDown size={11} className="shrink-0 opacity-70" />}
      </Link>
    );
    return kids.length > 0
      ? <div key={path} className="relative group flex items-center">{link}<NavDropdown items={kids} /></div>
      : <React.Fragment key={path}>{link}</React.Fragment>;
  };

  const menuBar = menuBarStyle === "bar" ? (
    <div className="hidden lg:block" style={{ backgroundColor: menuBarBg }}>
      <div className="max-w-[1280px] mx-auto flex items-stretch" style={padStyle}>
        <OverflowNav
          items={navItems}
          renderItem={renderBarItem}
          className="flex-1"
          navClassName="flex items-stretch"
          ariaLabel={t("menu.nav")}
          isActive={isActive}
          activeColor={menuActiveColor}
          recomputeKey={navRecomputeKey}
          moreLabel={t("menu.more")}
          moreWrapClassName="items-stretch"
          moreButtonStyle={{ fontSize: menuFontSize, fontWeight: menuFontWeight }}
          moreButtonClassName="flex items-center gap-1 px-4 py-2.5 uppercase tracking-wide whitespace-nowrap text-white hover:bg-black/15 transition-colors"
        />
        <div className="flex items-center pl-2 shrink-0">
          <HeaderSearch variant="onDark" onSubmit={runSearch} iconSize={15} />
        </div>
      </div>
    </div>
  ) : null;

  // ── Compact style ─────────────────────────────────────────────────────────
  if (style === "compact") {
    return (
      <div style={wrapStyle}>
        <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
          <div className="max-w-[1280px] mx-auto h-11 flex items-center gap-2" style={padStyle}>
            <button
              onClick={() => setMenu(v => !v)}
              className="text-gray-500 hover:text-gray-900 transition-colors p-1 shrink-0 rounded lg:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <Link href="/" className="min-w-0 shrink lg:shrink-0 mr-2 flex items-center self-center" onClick={() => setMenu(false)}>
              <HeaderLogo desktopSrc={logoSrc} mobileSrc={logoMobileSrc} alt={siteName}
                height={settings?.logoSize ? settings.logoSize * 0.65 : 30} mobileCap={34}
                mobileHeight={settings?.logoMobileSize} />
            </Link>

            {menuBarStyle === "attached" && (
              <OverflowNav
                items={navItems}
                renderItem={renderAttachedItem("px-2.5 py-0.5")}
                className="hidden lg:block self-center flex-1"
                navClassName="flex items-center gap-0"
                ariaLabel={t("menu.nav")}
                isActive={isActive}
                activeColor={menuActiveColor}
                recomputeKey={navRecomputeKey}
                moreLabel={t("menu.more")}
                moreButtonStyle={{ color: menuTextColor, fontSize: menuFontSize, fontWeight: menuFontWeight }}
                moreButtonClassName="px-2.5 py-0.5 whitespace-nowrap rounded-sm hover:bg-gray-100 inline-flex items-center gap-1"
              />
            )}
            {headerBanner}
            {menuBarStyle === "bar" && !headerBanner && <div className="hidden lg:block flex-1" />}

            <div className="flex-1 lg:hidden" />

            <div className="flex items-center gap-1 ml-auto">
              {settings?.showPushButton !== false && <PushSubscribeButton />}
              <div className={menuBarStyle === "bar" ? "lg:hidden" : ""}>
                <HeaderSearch variant="light" onSubmit={runSearch} iconSize={15} />
              </div>
            </div>
          </div>

          {menuBar}
        </header>
        {settings?.showTickerBar !== false && <TickerBar />}
        <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
          isActive={isActive} activeColor={menuActiveColor} logoSrc={logoMobileSrc} siteName={siteName} />
      </div>
    );
  }

  // ── Centered style ─────────────────────────────────────────────────────────
  if (style === "centered") {
    return (
      <div style={wrapStyle}>
        <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
          <div className="max-w-[1280px] mx-auto py-3 flex items-center justify-center relative" style={padStyle}>
            <button
              onClick={() => setMenu(v => !v)}
              aria-label={menuOpen ? t("menu.close") : t("menu.open")}
              className="absolute left-4 text-gray-500 hover:text-gray-900 p-1.5 rounded lg:hidden"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* max-w reserva os botões absolutos (menu à esquerda, busca à direita) */}
            <Link href="/" className="flex items-center justify-center min-w-0 max-w-[calc(100%-104px)]" onClick={() => setMenu(false)}>
              <HeaderLogo desktopSrc={logoSrc} mobileSrc={logoMobileSrc} alt={siteName}
                height={settings?.logoSize ?? 48} mobileCap={48}
                mobileHeight={settings?.logoMobileSize} centered />
            </Link>

            <div className="absolute right-4">
              <HeaderSearch variant="light" onSubmit={runSearch} iconSize={17} />
            </div>
          </div>

          {/* Barra própria do estilo centered — cor configurável (menuBarBgColor).
              A tinta acompanha a luminância dela: com barra clara o menu ficava
              branco sobre branco (invisível). */}
          <div className="hidden lg:block border-t border-gray-100"
            style={{ backgroundColor: centeredBarBg }}>
            <OverflowNav
              items={navItems}
              renderItem={renderCenteredItem}
              className="max-w-[1280px] mx-auto"
              style={padStyle}
              navClassName="flex items-center justify-center gap-1"
              ariaLabel={t("menu.nav")}
              isActive={isActive}
              activeColor={menuActiveColor}
              recomputeKey={navRecomputeKey}
              moreLabel={t("menu.more")}
              moreButtonStyle={{ fontSize: menuFontSize, fontWeight: menuFontWeight, color: centeredInk, opacity: 0.8 }}
              moreButtonClassName={`px-4 py-2 whitespace-nowrap inline-flex items-center gap-1 transition-colors hover:opacity-100 ${centeredBarIsDark ? "hover:bg-white/10" : "hover:bg-black/5"}`}
            />
          </div>

        </header>
        {settings?.showTickerBar !== false && <TickerBar />}
        <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
          isActive={isActive} activeColor={menuActiveColor} logoSrc={logoMobileSrc} siteName={siteName} />
      </div>
    );
  }

  // ── Standard style (default) ───────────────────────────────────────────────
  return (
    <div style={wrapStyle}>
      <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
        <div className="max-w-[1280px] mx-auto py-2 flex items-center gap-3" style={padStyle}>

          <button
            onClick={() => setMenu(v => !v)}
            className="text-gray-500 hover:text-gray-900 transition-colors p-1.5 shrink-0 rounded lg:hidden"
            aria-label={menuOpen ? t("menu.close") : t("menu.open")}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link href="/" className="min-w-0 shrink lg:shrink-0 mr-3 flex items-center self-center" onClick={() => setMenu(false)}>
            <HeaderLogo desktopSrc={logoSrc} mobileSrc={logoMobileSrc} alt={siteName}
              height={settings?.logoSize ?? 48} mobileCap={48}
              mobileHeight={settings?.logoMobileSize} />
          </Link>

          {menuBarStyle === "attached" && (
            <OverflowNav
              items={navItems}
              renderItem={renderAttachedItem("px-3 py-1 text-center")}
              className="hidden lg:block self-center flex-1"
              navClassName="flex items-center gap-2"
              ariaLabel={t("menu.nav")}
              isActive={isActive}
              activeColor={menuActiveColor}
              recomputeKey={navRecomputeKey}
              moreLabel={t("menu.more")}
              moreButtonStyle={{ color: menuTextColor, fontSize: menuFontSize, fontWeight: menuFontWeight }}
              moreButtonClassName="px-3 py-1 whitespace-nowrap rounded-sm hover:bg-gray-100 inline-flex items-center gap-1"
            />
          )}
          {headerBanner}
          {menuBarStyle === "bar" && !headerBanner && <div className="hidden lg:block flex-1" />}

          <div className="flex-1 lg:hidden" />

          <div className="flex items-center gap-1 ml-auto">
            {settings?.showPushButton !== false && <PushSubscribeButton />}
            {/* Com o menu em faixa, a busca do desktop mora na própria faixa. */}
            <div className={menuBarStyle === "bar" ? "lg:hidden" : ""}>
              <HeaderSearch variant="light" onSubmit={runSearch} iconSize={17} />
            </div>
          </div>
        </div>

        {menuBar}
      </header>
      {settings?.showTickerBar !== false && <TickerBar />}
      <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
        isActive={isActive} activeColor={menuActiveColor} logoSrc={logoSrc} siteName={siteName} />
    </div>
  );
}
