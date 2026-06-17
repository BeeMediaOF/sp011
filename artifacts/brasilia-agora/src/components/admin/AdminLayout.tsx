import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Image, Settings, LogOut,
  ChevronLeft, ChevronRight, Globe, Newspaper, Webhook, Megaphone,
  Users, Mail, BarChart2, LayoutGrid, Rss, Share2, Zap, ChevronDown,
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
  { label: "Webhook",           icon: Webhook,  path: "/admin/webhook" },
  { label: "Logo do Painel",    icon: Image,    path: "/admin/logo" },
  { label: "Informações do Site", icon: Globe,  path: "/admin/configuracoes" },
  { label: "Contato",           icon: Mail,     path: "/admin/contato" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
}

interface PanelTheme {
  logo: string;
  sidebar: string;
  accent: string;
  accentText: string;
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

function readAdminThemeFromStorage() {
  try {
    return {
      sidebar: localStorage.getItem(LS_SIDEBAR) || "#1a2448",
      accent:  localStorage.getItem(LS_ACCENT)  || "#c8102e",
    };
  } catch {
    return { sidebar: "#1a2448", accent: "#c8102e" };
  }
}

function usePanelTheme(): PanelTheme {
  const [theme, setTheme] = useState<PanelTheme>(() => {
    const { sidebar, accent } = readAdminThemeFromStorage();
    return { logo: _cachedLogo || logoFallback, sidebar, accent, accentText: "#ffffff" };
  });

  useEffect(() => {
    if (!_fetchPromise) {
      _fetchPromise = fetch("/api/site")
        .then((r) => r.json())
        .then((data: { adminLogoBase64?: string; logoBase64?: string; adminSidebarColor?: string; adminAccentColor?: string }) => {
          const sidebar = data.adminSidebarColor || "#1a2448";
          const accent  = data.adminAccentColor  || "#c8102e";
          _cachedLogo   = data.adminLogoBase64 || data.logoBase64 || logoFallback;
          saveAdminThemeToStorage(sidebar, accent);
          setTheme({ logo: _cachedLogo, sidebar, accent, accentText: "#ffffff" });
        })
        .catch(() => { _fetchPromise = null; });
    } else {
      if (_cachedLogo) {
        setTheme((prev) => ({ ...prev, logo: _cachedLogo! }));
      }
    }
  }, []);

  return theme;
}

export default function AdminLayout({ children, title, noPadding }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [location, navigate] = useLocation();
  const theme = usePanelTheme();

  const inConfig = NAV_CONFIG.some((i) => location.startsWith(i.path));

  // Auto-open config group when on a config page
  useEffect(() => {
    if (inConfig) setConfigOpen(true);
  }, [inConfig]);

  function handleLogout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  }

  function navLink(label: string, Icon: React.ElementType, path: string) {
    const active = path === "/admin"
      ? location === "/admin"
      : location.startsWith(path) && path !== "/admin";
    return (
      <Link
        key={path}
        href={path}
        className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors cursor-pointer
          ${active ? "font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        style={active ? { backgroundColor: theme.accent, color: theme.accentText } : {}}
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && <span>{label}</span>}
      </Link>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <aside
        className={`flex flex-col text-white transition-all duration-300 ${collapsed ? "w-16" : "w-60"}`}
        style={{ backgroundColor: theme.sidebar }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-white/10 min-h-[56px]">
          {!collapsed && (
            <div className="h-9 flex items-center shrink-0">
              <img src={theme.logo} alt="Logo" className="h-9 w-auto object-contain max-w-[152px]" />
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/70 hover:text-white transition-colors ml-auto shrink-0"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
          {NAV_MAIN.map(({ label, icon: Icon, path }) => navLink(label, Icon, path))}

          {/* Configurações group */}
          <div className="pt-2">
            <button
              onClick={() => !collapsed && setConfigOpen((o) => !o)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors
                ${inConfig ? "text-white font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}
                ${collapsed ? "cursor-default" : "cursor-pointer"}`}
              style={{ width: collapsed ? undefined : "calc(100% - 16px)" }}
            >
              <Settings size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Configurações</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform shrink-0 ${configOpen ? "rotate-180" : ""}`}
                  />
                </>
              )}
            </button>

            {/* Sub-items */}
            {(configOpen || collapsed) && (
              <div className={`mt-0.5 ${collapsed ? "" : "pl-3"}`}>
                {NAV_CONFIG.map(({ label, icon: Icon, path }) => navLink(label, Icon, path))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-4 space-y-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm transition-colors"
          >
            <Globe size={18} className="shrink-0" />
            {!collapsed && <span>Ver site</span>}
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-white/60 hover:text-red-400 hover:bg-white/10 text-sm transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          <span className="text-xs text-gray-400">Painel Administrativo</span>
        </header>
        <main className={`flex-1 overflow-hidden ${noPadding ? "" : "overflow-y-auto p-6"}`}>{children}</main>
      </div>
    </div>
  );
}
