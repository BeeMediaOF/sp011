import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Settings, LogOut,
  ChevronRight, Globe, Newspaper, Webhook, Megaphone,
  Users, BarChart2, LayoutGrid, Rss, Share2, Zap,
  ChevronDown, Bell, Search, ExternalLink, X, CheckCheck,
  UserCircle, KeyRound, Eye, AlertCircle, CheckCircle, Info,
  ShieldCheck, ClipboardList,
} from "lucide-react";
import logoFallback from "../../assets/images/logo_sbc_negativo.png";
import { getStoredUser, clearAuth } from "../../pages/Admin";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_MAIN = [
  { label: "Dashboard",    icon: LayoutDashboard, path: "/admin",              roles: ["admin", "editor"] },
  { label: "Analytics",    icon: BarChart2,        path: "/admin/analytics",   roles: ["admin", "editor"] },
  { label: "Artigos",      icon: FileText,         path: "/admin/artigos",     roles: ["admin"] },
  { label: "Novo Artigo",  icon: Newspaper,        path: "/admin/artigos/novo",roles: ["admin", "editor"] },
  { label: "Menu",         icon: Menu,             path: "/admin/menu",        roles: ["admin", "editor"] },
  { label: "Blocos Home",  icon: LayoutGrid,       path: "/admin/home-blocos", roles: ["admin"] },
  { label: "Propagandas",  icon: Megaphone,        path: "/admin/propagandas", roles: ["admin", "editor"] },
  { label: "Colunistas",   icon: Users,            path: "/admin/colunistas",  roles: ["admin"] },
  { label: "Fontes RSS",   icon: Rss,              path: "/admin/rss",         roles: ["admin"] },
  { label: "Perplexity",   icon: Zap,              path: "/admin/perplexity",  roles: ["admin"] },
  { label: "Redes Sociais",icon: Share2,           path: "/admin/redes-sociais", roles: ["admin"] },
  { label: "Usuários",     icon: UserCircle,       path: "/admin/usuarios",    roles: ["admin"] },
  { label: "Logs",         icon: ClipboardList,    path: "/admin/logs",        roles: ["admin"] },
];

const NAV_CONFIG = [
  { label: "Webhook",        icon: Webhook,     path: "/admin/webhook",        roles: ["admin"] },
  { label: "Segurança",      icon: ShieldCheck, path: "/admin/seguranca",      roles: ["admin"] },
  { label: "Configurações",  icon: Settings,    path: "/admin/configuracoes",  roles: ["admin"] },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
  topbarExtra?: React.ReactNode;
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

// ─── Notification types ───────────────────────────────────────────────────────
interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "success", title: "Artigo publicado",      body: "Novo artigo publicado com sucesso.",                                time: "2 min atrás",  read: false },
  { id: "2", type: "info",    title: "Nova fonte RSS",        body: "Fonte sincronizada com novos artigos.",                            time: "18 min atrás", read: false },
  { id: "3", type: "warning", title: "Propaganda expirando",  body: "Banner Principal expira em 2 dias.",                               time: "1 h atrás",    read: false },
  { id: "4", type: "error",   title: "Falha no RSS",          body: "Não foi possível acessar feed. Verifique a URL.",                  time: "3 h atrás",    read: true  },
  { id: "5", type: "info",    title: "Backup realizado",      body: "Backup automático concluído com sucesso.",                         time: "8 h atrás",    read: true  },
];

const NOTIF_ICON: Record<Notification["type"], React.ElementType> = {
  success: CheckCircle,
  info:    Info,
  warning: AlertCircle,
  error:   AlertCircle,
};
const NOTIF_COLOR: Record<Notification["type"], string> = {
  success: "#16A34A", info: "#2563EB", warning: "#D97706", error: "#DC2626",
};
const NOTIF_BG: Record<Notification["type"], string> = {
  success: "#DCFCE7", info: "#DBEAFE", warning: "#FEF3C7", error: "#FEE2E2",
};

function NotificationBell({ accent }: { accent: string }) {
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs] = useState(INITIAL_NOTIFICATIONS);
  const ref               = useRef<HTMLDivElement>(null);
  const unread            = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function markAllRead() { setNotifs((prev) => prev.map((n) => ({ ...n, read: true }))); }
  function dismiss(id: string) { setNotifs((prev) => prev.filter((n) => n.id !== id)); }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
            style={{ backgroundColor: accent }}>{unread}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-white rounded-2xl border border-slate-200 z-50 overflow-hidden"
          style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800">Notificações</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: accent }}>{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-[#0B2A66] transition-colors">
                <CheckCheck size={13} /> Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">Nenhuma notificação</div>
            ) : notifs.map((n) => {
              const NIcon = NOTIF_ICON[n.type];
              return (
                <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-slate-50 transition-colors ${n.read ? "bg-white" : "bg-blue-50/40"}`}>
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: NOTIF_BG[n.type] }}>
                    <NIcon size={14} style={{ color: NOTIF_COLOR[n.type] }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[12px] font-semibold leading-tight ${n.read ? "text-slate-600" : "text-slate-800"}`}>{n.title}</p>
                      <button onClick={() => dismiss(n.id)} className="text-slate-300 hover:text-slate-500 shrink-0 mt-0.5"><X size={12} /></button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 text-center">
            <button className="text-[11px] font-medium text-[#0B2A66] hover:underline">Ver todas as notificações</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const user            = getStoredUser();
  const initials        = user?.name?.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() ?? "AD";
  const roleLabel       = user?.role === "admin" ? "Administrador" : "Editor";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-[#0B2A66]">
          {initials}
        </div>
        <div className="hidden lg:block text-left">
          <p className="text-sm font-semibold text-slate-800 leading-none">{user?.name ?? "Usuário"}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{roleLabel}</p>
        </div>
        <ChevronDown size={13} className={`text-slate-400 transition-transform hidden lg:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[220px] bg-white rounded-2xl border border-slate-200 z-50 overflow-hidden py-1.5"
          style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0B2A66] flex items-center justify-center text-white text-sm font-bold shrink-0">{initials}</div>
              <div>
                <p className="text-[13px] font-bold text-slate-800 leading-none">{user?.name ?? "Usuário"}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{user?.email ?? ""}</p>
              </div>
            </div>
          </div>
          <div className="py-1">
            {[
              { Icon: Eye, label: "Ver portal", onClick: () => window.open("/", "_blank") },
            ].map(({ Icon, label, onClick }) => (
              <button key={label} onClick={() => { onClick(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-[#0B2A66] transition-colors text-left">
                <Icon size={15} className="text-slate-400" /> {label}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 py-1">
            <button onClick={() => { onLogout(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors text-left">
              <LogOut size={15} /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children, title, noPadding, topbarExtra }: AdminLayoutProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { accent, logo } = usePanelTheme();
  const user = getStoredUser();
  const role = user?.role ?? "editor";

  const visibleMain   = NAV_MAIN.filter((i) => i.roles.includes(role));
  const visibleConfig = NAV_CONFIG.filter((i) => i.roles.includes(role));
  const inConfig      = visibleConfig.some((i) => location.startsWith(i.path));

  useEffect(() => {
    if (inConfig) setConfigOpen(true);
  }, [inConfig]);

  function handleLogout() {
    clearAuth();
    navigate("/admin/login");
  }

  function navItem(label: string, Icon: React.ElementType, path: string, indent = false) {
    const active = path === "/admin"
      ? location === "/admin"
      : location.startsWith(path) && path !== "/admin";
    return (
      <Link key={path} href={path}
        className={`flex items-center gap-3 py-2.5 pr-4 text-sm transition-colors rounded-r-xl relative
          ${indent ? "pl-8" : "pl-5"}
          ${active
            ? "text-[#0B2A66] font-semibold bg-[#EEF2FF]"
            : "text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50"
          }`}
      >
        {active && (
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full" style={{ backgroundColor: accent }} />
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

        {/* Papel do usuário */}
        {role === "editor" && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-semibold text-amber-700">Acesso Editor</p>
            <p className="text-[10px] text-amber-600 mt-0.5">Algumas áreas estão restritas</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 pr-2">
          {visibleMain.map(({ label, icon: Icon, path }) => navItem(label, Icon, path))}

          {/* Configurações group (admin only) */}
          {visibleConfig.length > 0 && (
            <div className="pt-3">
              <button
                onClick={() => setConfigOpen((o) => !o)}
                className={`w-full flex items-center gap-3 pl-5 pr-4 py-2.5 text-sm transition-colors rounded-r-xl
                  ${inConfig ? "text-[#0B2A66] font-semibold bg-[#EEF2FF]" : "text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50"}`}
              >
                <Settings size={17} className={inConfig ? "text-[#0B2A66]" : "text-slate-400"} />
                <span className="flex-1 text-left">Configurações</span>
                <ChevronDown size={13} className={`transition-transform ${configOpen ? "rotate-180" : ""}`} />
              </button>
              {configOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {visibleConfig.map(({ label, icon: Icon, path }) => navItem(label, Icon, path, true))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 px-3 py-4 space-y-1">
          <a href="/" target="_blank" rel="noreferrer"
            className="flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 hover:text-[#0B2A66] hover:bg-slate-50 transition-colors">
            <ExternalLink size={16} className="text-slate-400" />
            <span>Ver site</span>
          </a>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors">
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
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Buscar no portal..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {topbarExtra ? topbarExtra : (
              <>
                <span className="text-sm text-slate-500 hidden lg:flex items-center gap-2">
                  <span className="text-slate-400">📅</span> {formatDate()}
                </span>
                <NotificationBell accent={accent} />
                <UserMenu onLogout={handleLogout} />
              </>
            )}
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
