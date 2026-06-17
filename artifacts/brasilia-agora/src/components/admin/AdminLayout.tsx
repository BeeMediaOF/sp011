import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Image, Settings, LogOut,
  ChevronRight, Globe, Newspaper, Webhook, Megaphone,
  Users, Mail, BarChart2, LayoutGrid, Rss, Share2, Zap,
  ChevronDown, Bell, Search, ExternalLink,
} from "lucide-react";
import logoFallback from "../../assets/images/logo_sbc_negativo.png";

const NAV_MAIN = [
  { label: "Dashboard",    icon: LayoutDashboard, path: "/admin" },
  { label: "Analytics",    icon: BarChart2,        path: "/admin/analytics" },
  { label: "Artigos",      icon: FileText,         path: "/admin/artigos" },
  { label: "Novo Artigo",  icon: Newspaper,        path: "/admin/artigos/novo" },
  { label: "Menu",         icon: Menu,             path: "/admin/menu" },
  { label: "Blocos Home",  icon: LayoutGrid,       path: "/admin/home-blocos" },
  { label: "Propagandas",  icon: Megaphone,        path: "/admin/propagandas" },
  { label: "Colunistas",   icon: Users,            path: "/admin/colunistas" },
  { label: "Fontes RSS",   icon: Rss,              path: "/admin/rss" },
  { label: "Perplexity",   icon: Zap,              path: "/admin/perplexity" },
  { label: "Redes Sociais",icon: Share2,           path: "/admin/redes-sociais" },
];

const NAV_CONFIG = [
  { label: "Webhook",             icon: Webhook, path: "/admin/webhook" },
  { label: "Logo do Painel",      icon: Image,   path: "/admin/logo" },
  { label: "Informações do Site", icon: Globe,   path: "/admin/configuracoes" },
  { label: "Contato",             icon: Mail,    path: "/admin/contato" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
}

const LS_SIDEBAR = "admin_sidebar_color";
const LS_ACCENT  = "admin_accent_color";

let _cachedLogo: string | null = null;
let _fetchPromise: Promise<void> | null = null;

export function saveAdminThemeToStorage(sidebar: string, accent: string) {
  try {
    localStorage.setItem(LS_SIDEBAR, sidebar);
    localStorage.setItem(LS_ACCENT,  accent);
  } catch {}
}

function usePanelTheme() {
  const [accent, setAccent] = useState(() => {
    try { return localStorage.getItem(LS_ACCENT) || "#E71D36"; } catch { return "#E71D36"; }
  });
  const [logo, setLogo] = useState(_cachedLogo || logoFallback);

  useEffect(() => {
    if (!_fetchPromise) {
      _fetchPromise = fetch("/api/site")
        .then((r) => r.json())
        .then((data: { adminLogoBase64?: string; logoBase64?: string; adminSidebarColor?: string; adminAccentColor?: string }) => {
          const ac = data.adminAccentColor || "#E71D36";
          _cachedLogo = data.adminLogoBase64 || data.logoBase64 || logoFallback;
          saveAdminThemeToStorage(data.adminSidebarColor || "#0B2A66", ac);
          setAccent(ac);
          setLogo(_cachedLogo);
        })
        .catch(() => { _fetchPromise = null; });
    } else {
      if (_cachedLogo) setLogo(_cachedLogo);
    }
  }, []);

  return { accent, logo };
}

function formatDate() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export default function AdminLayout({ children, title, noPadding }: AdminLayoutProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { accent, logo } = usePanelTheme();

  const inConfig = NAV_CONFIG.some((i) => location.startsWith(i.path));

  useEffect(() => {
    if (inConfig) setConfigOpen(true);
  }, [inConfig]);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  }

  function navItem(label: string, Icon: React.ElementType, path: string, indent = false) {
    const active = path === "/admin"
      ? location === "/admin"
      : location.startsWith(path) && path !== "/admin";
    return (
      <Link
        key={path}
        href={path}
        className={`flex items-center gap-3 py-2.5 pr-4 text-sm transition-colors rounded-r-xl relative
          ${indent ? "pl-8" : "pl-5"}
          ${active
            ? "text-[#0B2A66] font-semibold bg-[#EEF2FF]"
            : "text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50"
          }`}
      >
        {active && (
          <span
            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <Icon size={17} className={active ? "text-[#0B2A66]" : "text-slate-400"} />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "#F7F9FC", fontFamily: "Inter, sans-serif" }}>

      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="w-[260px] shrink-0 bg-white border-r border-slate-100 flex flex-col h-full overflow-y-auto">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100">
          <img src={logo} alt="SBC Agora" className="h-9 w-auto object-contain" />
          <p className="text-[10px] text-slate-400 mt-1 tracking-wide">A notícia em tempo real</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 pr-2">
          {NAV_MAIN.map(({ label, icon: Icon, path }) => navItem(label, Icon, path))}

          {/* Configurações group */}
          <div className="pt-3">
            <button
              onClick={() => setConfigOpen((o) => !o)}
              className={`w-full flex items-center gap-3 pl-5 pr-4 py-2.5 text-sm transition-colors rounded-r-xl
                ${inConfig ? "text-[#0B2A66] font-semibold bg-[#EEF2FF]" : "text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50"}`}
            >
              {inConfig && (
                <span
                  className="absolute left-0 w-[3px] rounded-r-full"
                  style={{ backgroundColor: accent, top: "4px", bottom: "4px" }}
                />
              )}
              <Settings size={17} className={inConfig ? "text-[#0B2A66]" : "text-slate-400"} />
              <span className="flex-1 text-left">Configurações</span>
              <ChevronDown size={13} className={`transition-transform ${configOpen ? "rotate-180" : ""}`} />
            </button>

            {configOpen && (
              <div className="mt-0.5 space-y-0.5">
                {NAV_CONFIG.map(({ label, icon: Icon, path }) => navItem(label, Icon, path, true))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 px-3 py-4 space-y-1">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50 transition-colors"
          >
            <ExternalLink size={16} className="text-slate-400" />
            <span>Ver site</span>
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} className="text-slate-400" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-[72px] bg-white border-b border-slate-100 px-8 flex items-center gap-6 shrink-0">
          <h1 className="text-xl font-bold text-[#0B2A66] shrink-0">{title}</h1>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar no portal..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {/* Date */}
            <span className="text-sm text-slate-500 hidden lg:block">{formatDate()}</span>

            {/* Notifications */}
            <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
              <Bell size={18} />
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: accent }}
              />
            </button>

            {/* User */}
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: "#0B2A66" }}
              >
                AD
              </div>
              <div className="hidden lg:block">
                <p className="text-sm font-semibold text-slate-800 leading-none">Administrador</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Super Admin</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 overflow-hidden ${noPadding ? "" : "overflow-y-auto p-8"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
