import React, { useState, useEffect } from "react";
import { BRAND } from "../brand";
import { Link, useLocation } from "wouter";
import { Search, Menu, X } from "lucide-react";
import { useSite } from "../hooks/useSite";
import { trackSearch } from "../hooks/useAnalytics";
import PushSubscribeButton from "./PushSubscribeButton";
import logoImg from "../assets/images/logo_sbc_agora.png";

const FALLBACK_NAV = [
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
  navItems: { label: string; path: string }[];
  isActive: (path: string) => boolean;
  activeColor: string;
  logoSrc: string;
  siteName: string;
}

function MobileNav({ open, onClose, navItems, isActive, activeColor, logoSrc, siteName }: MobileNavProps) {
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
        aria-label="Menu de navegação"
        className={`fixed top-0 left-0 z-50 h-full w-[84%] max-w-[330px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-gray-200 shrink-0">
          <img src={logoSrc} alt={siteName} className="h-7 w-auto object-contain" />
          <button onClick={onClose} aria-label="Fechar menu" className="p-2 -mr-2 text-gray-500 hover:text-gray-900 rounded-lg transition-colors">
            <X size={22} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {navItems.map(({ label, path }) => {
              const active = isActive(path);
              return (
                <li key={path}>
                  <Link
                    href={path}
                    onClick={onClose}
                    className="flex items-center gap-3 py-3 px-3 rounded-xl text-[15px] font-semibold transition-colors hover:bg-gray-50 active:bg-gray-100"
                    style={{ color: active ? activeColor : "#374151" }}
                  >
                    <span className="w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: active ? activeColor : "#e5e7eb" }} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>
  );
}

// ─── Header principal ─────────────────────────────────────────────────────────
export default function Header() {
  const { settings }            = useSite();
  // Logo configurada no painel (Configurações → logo) tem prioridade; a imagem
  // empacotada no bundle é só fallback quando nenhuma logo foi enviada.
  const logoSrc = settings?.logoBase64 || logoImg;
  const [location]              = useLocation();
  const [menuOpen, setMenu]       = useState(false);
  const [searchOpen, setSearch]   = useState(false);
  const [searchQuery, setSearchQ] = useState("");

  const [, navigate] = useLocation();

  function submitSearch(q: string) {
    if (!q.trim()) return;
    trackSearch(q.trim());
    setSearch(false);
    setSearchQ("");
    navigate(`/arquivo?q=${encodeURIComponent(q.trim())}`);
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submitSearch(searchQuery);
  }

  const style = settings?.headerStyle ?? "standard";

  const navItems =
    settings?.menuItems && settings.menuItems.length > 0
      ? settings.menuItems
      : FALLBACK_NAV;

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
    color: isActive(path) ? menuActiveColor : menuTextColor,
    fontSize: menuFontSize,
    fontWeight: menuFontWeight,
  });

  // ── Margem lateral interna do cabeçalho (configurável no painel) ───────────
  // Evita que o conteúdo (logo, menu, ícones) fique colado nas bordas do site.
  const headerPadX = settings?.headerPaddingX ?? 16;
  const padStyle: React.CSSProperties = { paddingLeft: headerPadX, paddingRight: headerPadX };
  // Margem acima do cabeçalho (afasta-o do topo do site). Aplicada no wrapper.
  const headerMarginTop = settings?.headerMarginTop ?? 0;
  const wrapStyle: React.CSSProperties = { marginTop: headerMarginTop };
  const siteName = settings?.siteName ?? BRAND.name;

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

            <Link href="/" className="shrink-0 mr-2 flex items-center self-center" onClick={() => setMenu(false)}>
              <img
                src={logoSrc}
                alt={settings?.siteName ?? BRAND.name}
                style={{ height: settings?.logoSize ? settings.logoSize * 0.65 : 30 }}
                className="w-auto object-contain block"
              />
            </Link>

            <nav className="hidden lg:flex items-center self-center gap-0 flex-1 overflow-x-auto no-scrollbar">
              {navItems.map(({ label, path }) => (
                <Link
                  key={path}
                  href={path}
                  style={navItemStyle(path)}
                  className="px-2.5 py-0.5 whitespace-nowrap transition-colors rounded-sm hover:bg-gray-100"
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="flex-1 lg:hidden" />

            <div className="flex items-center gap-1 ml-auto">
              <PushSubscribeButton />
              {searchOpen ? (
                <>
                  <input autoFocus type="text" placeholder="Pesquisar..."
                    aria-label="Pesquisar no site"
                    value={searchQuery}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={handleSearchKey}
                    className="bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1 text-[12px] rounded focus:outline-none focus:border-gray-500 w-[150px]"
                  />
                  <button onClick={() => submitSearch(searchQuery)} aria-label="Buscar" className="text-gray-500 hover:text-gray-900 p-1">
                    <Search size={14} />
                  </button>
                  <button onClick={() => { setSearch(false); setSearchQ(""); }} aria-label="Fechar busca" className="text-gray-400 hover:text-gray-800 p-1">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <button onClick={() => setSearch(true)} aria-label="Abrir busca" className="text-gray-500 hover:text-gray-900 p-1 transition-colors rounded">
                  <Search size={15} />
                </button>
              )}
            </div>
          </div>

        </header>
        {settings?.showTickerBar !== false && <TickerBar />}
        <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
          isActive={isActive} activeColor={menuActiveColor} logoSrc={logoSrc} siteName={siteName} />
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
              aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
              className="absolute left-4 text-gray-500 hover:text-gray-900 p-1.5 rounded lg:hidden"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/" className="flex items-center" onClick={() => setMenu(false)}>
              <img
                src={logoSrc}
                alt={settings?.siteName ?? BRAND.name}
                style={{ height: settings?.logoSize ?? 48 }}
                className="w-auto object-contain block"
              />
            </Link>

            <button
              onClick={() => setSearch(v => !v)}
              aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
              className="absolute right-4 text-gray-500 hover:text-gray-900 p-1.5 rounded"
            >
              <Search size={17} />
            </button>
          </div>

          <div className="hidden lg:block border-t border-gray-100 bg-[#1a2448]">
            <nav className="max-w-[1280px] mx-auto flex items-center justify-center gap-1" style={padStyle}>
              {navItems.map(({ label, path }) => (
                <Link
                  key={path}
                  href={path}
                  style={{
                    // Barra escura própria: mantemos texto claro/legível e usamos a
                    // cor do item ativo, tamanho e peso configurados no painel.
                    fontSize: menuFontSize,
                    fontWeight: menuFontWeight,
                    color: isActive(path) ? "#ffffff" : "rgba(255,255,255,0.8)",
                    borderBottom: isActive(path) ? `2px solid ${menuActiveColor}` : undefined,
                  }}
                  className="px-4 py-2 whitespace-nowrap transition-colors hover:text-white hover:bg-white/10"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {searchOpen && (
            <div className="px-4 py-2 border-t border-gray-100 flex gap-2">
              <input autoFocus type="text" placeholder="Pesquisar..."
                aria-label="Pesquisar no site"
                value={searchQuery}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={handleSearchKey}
                className="flex-1 bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1.5 text-sm rounded focus:outline-none focus:border-gray-500"
              />
              <button onClick={() => submitSearch(searchQuery)} aria-label="Buscar" className="text-gray-500 hover:text-gray-900 p-1">
                <Search size={16} />
              </button>
              <button onClick={() => { setSearch(false); setSearchQ(""); }} aria-label="Fechar busca" className="text-gray-400 hover:text-gray-800 p-1">
                <X size={16} />
              </button>
            </div>
          )}

        </header>
        {settings?.showTickerBar !== false && <TickerBar />}
        <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
          isActive={isActive} activeColor={menuActiveColor} logoSrc={logoSrc} siteName={siteName} />
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
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link href="/" className="shrink-0 mr-3 flex items-center self-center" onClick={() => setMenu(false)}>
            <img
              src={logoSrc}
              alt={settings?.siteName ?? BRAND.name}
              style={{ height: settings?.logoSize ?? 48 }}
              className="w-auto object-contain block"
            />
          </Link>

          <nav className="hidden lg:flex items-center self-center gap-0 flex-1 overflow-x-auto no-scrollbar">
            {navItems.map(({ label, path }) => (
              <Link
                key={path}
                href={path}
                style={navItemStyle(path)}
                className="px-3 py-1 whitespace-nowrap transition-colors rounded-sm hover:bg-gray-100 text-center ml-[4px] mr-[4px]"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex-1 lg:hidden" />

          <div className="flex items-center gap-1 ml-auto">
            <PushSubscribeButton />
            {searchOpen ? (
              <>
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar..."
                  aria-label="Pesquisar no site"
                  value={searchQuery}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={handleSearchKey}
                  className="bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1 text-[12px] rounded focus:outline-none focus:border-gray-500 w-[150px] sm:w-[200px]"
                />
                <button
                  onClick={() => submitSearch(searchQuery)}
                  aria-label="Buscar"
                  className="text-gray-500 hover:text-gray-900 p-1 transition-colors"
                >
                  <Search size={15} />
                </button>
                <button
                  onClick={() => { setSearch(false); setSearchQ(""); }}
                  aria-label="Fechar busca"
                  className="text-gray-400 hover:text-gray-800 p-1 transition-colors"
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setSearch(true)}
                aria-label="Abrir busca"
                className="text-gray-500 hover:text-gray-900 p-1.5 transition-colors rounded"
              >
                <Search size={17} />
              </button>
            )}
          </div>
        </div>

      </header>
      {settings?.showTickerBar !== false && <TickerBar />}
      <MobileNav open={menuOpen} onClose={() => setMenu(false)} navItems={navItems}
        isActive={isActive} activeColor={menuActiveColor} logoSrc={logoSrc} siteName={siteName} />
    </div>
  );
}
