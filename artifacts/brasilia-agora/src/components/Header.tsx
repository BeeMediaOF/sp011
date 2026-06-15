import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, Menu, X } from "lucide-react";
import { useSite } from "../hooks/useSite";
import logoImg from "../assets/images/logo_brasilia_agora.png";

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
  const [data, setData]   = useState<QuotesData | null>(null);
  const railRef           = useRef<HTMLDivElement>(null);
  const posRef            = useRef(0);
  const rafRef            = useRef<number>(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/quotes").then(r => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const SPEED = 0.5;
    const singleW = () => rail.scrollWidth / 3;
    function step() {
      posRef.current += SPEED;
      if (posRef.current >= singleW()) posRef.current -= singleW();
      rail!.style.transform = `translateX(-${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [data]);

  const f2 = (v: string) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const f0 = (v: string) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const items = [
    { code: "USD",     value: data?.fx?.USDBRL     ? f2(data.fx.USDBRL.bid)         : "—", pct: data?.fx?.USDBRL?.pctChange     ?? "0" },
    { code: "EUR",     value: data?.fx?.EURBRL     ? f2(data.fx.EURBRL.bid)         : "—", pct: data?.fx?.EURBRL?.pctChange     ?? "0" },
    { code: "GBP",     value: data?.fx?.GBPBRL     ? f2(data.fx.GBPBRL.bid)         : "—", pct: data?.fx?.GBPBRL?.pctChange     ?? "0" },
    { code: "BTC",     value: data?.crypto?.BTCBRL ? f0(data.crypto.BTCBRL.bid)     : "—", pct: data?.crypto?.BTCBRL?.pctChange ?? "0" },
    { code: "ETH",     value: data?.crypto?.ETHBRL ? f0(data.crypto.ETHBRL.bid)     : "—", pct: data?.crypto?.ETHBRL?.pctChange ?? "0" },
  ];

  const track = [...items, ...items, ...items];

  return (
    <div className="bg-gray-100 border-b border-gray-200 overflow-hidden h-8 flex items-center select-none">
      <div className="overflow-hidden flex-1">
        <div ref={railRef} className="flex items-center gap-10 w-max will-change-transform">
          {track.map(({ code, value, pct }, i) => {
            const val = parseFloat(pct);
            const up  = val >= 0;
            return (
              <span key={i} className="flex items-center gap-1.5 shrink-0 text-[11px]">
                <span className="font-bold text-gray-400 uppercase tracking-wider">{code}</span>
                <span className="text-gray-800 font-medium">{value}</span>
                <span className="font-bold" style={{ color: up ? "#16a34a" : "#dc2626" }}>
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

// ─── Header principal ─────────────────────────────────────────────────────────
export default function Header() {
  const { settings }            = useSite();
  const [location]              = useLocation();
  const [menuOpen, setMenu]     = useState(false);
  const [searchOpen, setSearch] = useState(false);

  const style = settings?.headerStyle ?? "standard";

  const navItems =
    settings?.menuItems && settings.menuItems.length > 0
      ? settings.menuItems
      : FALLBACK_NAV;

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location === path || location.startsWith(path + "/");

  const bgColor = settings?.headerBgColor ?? "#ffffff";
  const bgStyle = { backgroundColor: bgColor };

  // ── Compact style ─────────────────────────────────────────────────────────
  if (style === "compact") {
    return (
      <div className="sticky top-0 z-50">
        <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
          <div className="max-w-[1280px] mx-auto px-4 h-11 flex items-center gap-2">
            <button
              onClick={() => setMenu(v => !v)}
              className="text-gray-500 hover:text-gray-900 transition-colors p-1 shrink-0 rounded lg:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <Link href="/" className="shrink-0 mr-2 flex items-center self-center" onClick={() => setMenu(false)}>
              <img
                src={logoImg}
                alt={settings?.siteName ?? "SBC Agora"}
                style={{ height: settings?.logoSize ? settings.logoSize * 0.65 : 30 }}
                className="w-auto object-contain block"
              />
            </Link>

            <nav className="hidden lg:flex items-center self-center gap-0 flex-1 overflow-x-auto no-scrollbar">
              {navItems.map(({ label, path }) => (
                <Link
                  key={path}
                  href={path}
                  className={`text-[12px] font-bold px-2.5 py-0.5 whitespace-nowrap transition-colors rounded-sm hover:text-gray-900 hover:bg-gray-100 ${isActive(path) ? "text-[#c8102e]" : "text-gray-500"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="flex-1 lg:hidden" />

            <div className="flex items-center gap-1 ml-auto">
              {searchOpen ? (
                <>
                  <input autoFocus type="text" placeholder="Pesquisar..."
                    className="bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1 text-[12px] rounded focus:outline-none focus:border-gray-500 w-[150px]"
                  />
                  <button onClick={() => setSearch(false)} className="text-gray-400 hover:text-gray-800 p-1">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <button onClick={() => setSearch(true)} className="text-gray-500 hover:text-gray-900 p-1 transition-colors rounded">
                  <Search size={15} />
                </button>
              )}
            </div>
          </div>

          {menuOpen && (
            <div className="lg:hidden bg-white border-t border-gray-200">
              <ul className="max-w-[1280px] mx-auto px-4 py-2 flex flex-col gap-0.5">
                {navItems.map(({ label, path }) => (
                  <li key={path}>
                    <Link href={path} onClick={() => setMenu(false)}
                      className={`flex items-center gap-3 py-2 px-2 rounded text-[13px] font-bold transition-colors ${isActive(path) ? "text-[#c8102e]" : "text-gray-600 hover:text-gray-900"}`}
                    >
                      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: isActive(path) ? "#c8102e" : "#d1d5db" }} />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </header>
      </div>
    );
  }

  // ── Centered style ─────────────────────────────────────────────────────────
  if (style === "centered") {
    return (
      <div className="sticky top-0 z-50">
        <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
          {/* Top row: logo centered */}
          <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center justify-center relative">
            <button
              onClick={() => setMenu(v => !v)}
              className="absolute left-4 text-gray-500 hover:text-gray-900 p-1.5 rounded lg:hidden"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link href="/" className="flex items-center" onClick={() => setMenu(false)}>
              <img
                src={logoImg}
                alt={settings?.siteName ?? "SBC Agora"}
                style={{ height: settings?.logoSize ?? 48 }}
                className="w-auto object-contain block"
              />
            </Link>

            <button
              onClick={() => setSearch(v => !v)}
              className="absolute right-4 text-gray-500 hover:text-gray-900 p-1.5 rounded"
            >
              <Search size={17} />
            </button>
          </div>

          {/* Nav row below logo */}
          <div className="hidden lg:block border-t border-gray-100 bg-[#1a2448]">
            <nav className="max-w-[1280px] mx-auto px-4 flex items-center justify-center gap-1">
              {navItems.map(({ label, path }) => (
                <Link
                  key={path}
                  href={path}
                  className={`text-[12px] font-bold px-4 py-2 whitespace-nowrap transition-colors text-white/80 hover:text-white hover:bg-white/10 ${isActive(path) ? "text-white border-b-2 border-[#c8102e]" : ""}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {searchOpen && (
            <div className="px-4 py-2 border-t border-gray-100 flex gap-2">
              <input autoFocus type="text" placeholder="Pesquisar..."
                className="flex-1 bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1.5 text-sm rounded focus:outline-none focus:border-gray-500"
              />
              <button onClick={() => setSearch(false)} className="text-gray-400 hover:text-gray-800 p-1">
                <X size={16} />
              </button>
            </div>
          )}

          {menuOpen && (
            <div className="lg:hidden bg-white border-t border-gray-200">
              <ul className="max-w-[1280px] mx-auto px-4 py-3 flex flex-col gap-0.5">
                {navItems.map(({ label, path }) => (
                  <li key={path}>
                    <Link href={path} onClick={() => setMenu(false)}
                      className={`flex items-center gap-3 py-2.5 px-2 rounded text-[14px] font-bold transition-colors ${isActive(path) ? "text-[#c8102e]" : "text-gray-600 hover:text-gray-900"}`}
                    >
                      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: isActive(path) ? "#c8102e" : "#d1d5db" }} />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </header>
        <TickerBar />
      </div>
    );
  }

  // ── Standard style (default) ───────────────────────────────────────────────
  return (
    <div className="sticky top-0 z-50">
      <header className="shadow-sm border-b border-gray-200" style={bgStyle}>
        <div className="max-w-[1280px] mx-auto px-4 py-2 flex items-center gap-3">

          <button
            onClick={() => setMenu(v => !v)}
            className="text-gray-500 hover:text-gray-900 transition-colors p-1.5 shrink-0 rounded"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link href="/" className="shrink-0 mr-3 flex items-center self-center" onClick={() => setMenu(false)}>
            <img
              src={logoImg}
              alt={settings?.siteName ?? "Bee News"}
              style={{ height: settings?.logoSize ?? 48 }}
              className="w-auto object-contain block"
            />
          </Link>

          <nav className="hidden lg:flex items-center self-center gap-0 flex-1 overflow-x-auto no-scrollbar">
            {navItems.map(({ label, path }) => (
              <Link
                key={path}
                href={path}
                className={`text-[13px] font-bold px-3 py-1 whitespace-nowrap transition-colors rounded-sm hover:text-gray-900 hover:bg-gray-100 text-center ml-[4px] mr-[4px] ${isActive(path) ? "text-[#c8102e]" : "text-gray-500"}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex-1 lg:hidden" />

          <div className="flex items-center gap-1 ml-auto">
            {searchOpen ? (
              <>
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar..."
                  className="bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 px-3 py-1 text-[12px] rounded focus:outline-none focus:border-gray-500 w-[150px] sm:w-[200px]"
                />
                <button
                  onClick={() => setSearch(false)}
                  className="text-gray-400 hover:text-gray-800 p-1 transition-colors"
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setSearch(true)}
                className="text-gray-500 hover:text-gray-900 p-1.5 transition-colors rounded"
              >
                <Search size={17} />
              </button>
            )}
          </div>
        </div>

        {menuOpen && (
          <div className="lg:hidden bg-white border-t border-gray-200">
            <ul className="max-w-[1280px] mx-auto px-4 py-3 flex flex-col gap-0.5">
              {navItems.map(({ label, path }) => (
                <li key={path}>
                  <Link
                    href={path}
                    onClick={() => setMenu(false)}
                    className={`flex items-center gap-3 py-2.5 px-2 rounded text-[14px] font-bold transition-colors ${
                      isActive(path) ? "text-[#c8102e]" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <span
                      className="w-1 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: isActive(path) ? "#c8102e" : "#d1d5db" }}
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>
      <TickerBar />
    </div>
  );
}
