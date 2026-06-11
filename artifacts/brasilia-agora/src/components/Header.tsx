import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, Menu, X } from "lucide-react";
import { useSite } from "../hooks/useSite";
import logoImg from "../assets/images/logo_novo.png";

const navItems = [
  { label: "Início",     path: "/" },
  { label: "Brasil",     path: "/brasil" },
  { label: "Mundo",      path: "/mundo" },
  { label: "Política",   path: "/politica" },
  { label: "Economia",   path: "/economia" },
  { label: "Esporte",    path: "/esporte" },
  { label: "Cultura",    path: "/cultura" },
  { label: "Tecnologia", path: "/tecnologia" },
  { label: "Saúde",      path: "/saude" },
  { label: "DF",         path: "/df" },
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
    <div className="bg-[#111111] border-b border-white/5 overflow-hidden h-8 flex items-center select-none">
      <div className="overflow-hidden flex-1">
        <div ref={railRef} className="flex items-center gap-10 w-max will-change-transform">
          {track.map(({ code, value, pct }, i) => {
            const val = parseFloat(pct);
            const up  = val >= 0;
            return (
              <span key={i} className="flex items-center gap-1.5 shrink-0 text-[11px]">
                <span className="font-bold text-white/50 uppercase tracking-wider">{code}</span>
                <span className="text-white font-medium">{value}</span>
                <span className="font-bold" style={{ color: up ? "#4ade80" : "#f87171" }}>
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
  const { settings }          = useSite();
  const [location]            = useLocation();
  const [menuOpen, setMenu]   = useState(false);
  const [searchOpen, setSearch] = useState(false);

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location === path || location.startsWith(path + "/");

  return (
    <>
      {/* ── Barra principal ── */}
      <header className="bg-[#0a0a0a] sticky top-0 z-50 shadow-lg">
        <div className="max-w-[1280px] mx-auto px-3 h-12 flex items-center gap-2">

          {/* Hamburger */}
          <button
            onClick={() => setMenu(v => !v)}
            className="text-white/60 hover:text-white transition-colors p-1.5 shrink-0 rounded"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo */}
          <Link href="/" className="shrink-0 mr-3" onClick={() => setMenu(false)}>
            <img
              src={logoImg}
              alt={settings?.siteName ?? "Bee News"}
              className="h-10 w-auto object-contain"
            />
          </Link>

          {/* Nav links — apenas desktop */}
          <nav className="hidden lg:flex items-center gap-0 flex-1 overflow-x-auto no-scrollbar">
            {navItems.map(({ label, path }) => (
              <Link
                key={path}
                href={path}
                className={`text-[13px] font-bold px-3 py-1 whitespace-nowrap transition-colors rounded-sm ${
                  isActive(path)
                    ? "text-white bg-white/10"
                    : "text-white/55 hover:text-white hover:bg-white/5"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Espaço flexível no tablet */}
          <div className="flex-1 lg:hidden" />

          {/* Busca */}
          <div className="flex items-center gap-1 ml-auto">
            {searchOpen ? (
              <>
                <input
                  autoFocus
                  type="text"
                  placeholder="Pesquisar..."
                  className="bg-white/10 border border-white/20 text-white placeholder-white/30 px-3 py-1 text-[12px] rounded focus:outline-none focus:border-white/50 w-[150px] sm:w-[200px]"
                />
                <button
                  onClick={() => setSearch(false)}
                  className="text-white/50 hover:text-white p-1 transition-colors"
                  aria-label="Fechar busca"
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setSearch(true)}
                className="text-white/60 hover:text-white p-1.5 transition-colors rounded"
                aria-label="Pesquisar"
              >
                <Search size={17} />
              </button>
            )}
          </div>
        </div>

        {/* ── Drawer mobile ── */}
        {menuOpen && (
          <div className="lg:hidden bg-[#111] border-t border-white/10">
            <ul className="max-w-[1280px] mx-auto px-4 py-3 flex flex-col gap-0.5">
              {navItems.map(({ label, path }) => (
                <li key={path}>
                  <Link
                    href={path}
                    onClick={() => setMenu(false)}
                    className={`flex items-center gap-3 py-2.5 px-2 rounded text-[14px] font-bold transition-colors ${
                      isActive(path) ? "text-white" : "text-white/55 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-1 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: isActive(path) ? "#c8102e" : "rgba(255,255,255,0.2)" }}
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* ── Ticker de cotações ── */}
      <TickerBar />
    </>
  );
}
