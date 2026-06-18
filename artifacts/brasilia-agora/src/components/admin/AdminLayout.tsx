import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Settings, LogOut,
  ChevronRight, Globe, Newspaper, Webhook, Megaphone,
  Users, BarChart2, LayoutGrid, Rss, Share2, Zap,
  ChevronDown, Bell, Search, ExternalLink, X, CheckCheck,
  UserCircle, KeyRound, Eye, AlertCircle, CheckCircle, Info,
  ShieldCheck, ClipboardList, Camera, Pencil, Moon, Sun, Bot,
} from "lucide-react";
import logoFallback from "../../assets/images/logo_sbc_negativo.png";
import { getStoredUser, setStoredUser, clearAuth } from "../../pages/Admin";
import { adminApi } from "../../lib/adminApi";
import { saveAdminThemeToStorage } from "../../lib/adminTheme";
import { getAdminDarkMode, setAdminDarkMode } from "../../lib/adminDarkMode";

// ─── Nav config ───────────────────────────────────────────────────────────────
// permKey: null  → admin-only, never shown to editors
// permKey: string → editor needs that permission enabled

const NAV_MAIN = [
  { label: "Dashboard",     icon: LayoutDashboard, path: "/admin",               permKey: "dashboard.view" },
  { label: "Analytics",     icon: BarChart2,        path: "/admin/analytics",    permKey: "analytics.view" },
  { label: "Artigos",       icon: FileText,         path: "/admin/artigos",      permKey: "articles.view" },
  { label: "Novo Artigo",   icon: Newspaper,        path: "/admin/artigos/novo", permKey: "articles.create" },
  { label: "Menu",          icon: Menu,             path: "/admin/menu",         permKey: "menu.view" },
  { label: "Blocos Home",   icon: LayoutGrid,       path: "/admin/home-blocos",  permKey: "home_blocks.view" },
  { label: "Propagandas",   icon: Megaphone,        path: "/admin/propagandas",  permKey: "ads.view" },
  { label: "Colunistas",    icon: Users,            path: "/admin/colunistas",   permKey: "columnists.view" },
  { label: "Fontes RSS",    icon: Rss,              path: "/admin/rss",          permKey: "rss.view" },
  { label: "Máquina Artigos", icon: Bot,            path: "/admin/maquina-artigos", permKey: "articles.create" },
  { label: "Perplexity",    icon: Zap,              path: "/admin/perplexity",   permKey: null },
  { label: "Redes Sociais", icon: Share2,           path: "/admin/redes-sociais",permKey: "social.view" },
  { label: "Usuários",      icon: UserCircle,       path: "/admin/usuarios",     permKey: "users.manage" },
  { label: "Logs",          icon: ClipboardList,    path: "/admin/configuracoes?tab=logs", permKey: "logs.view" },
];

const NAV_CONFIG = [
  { label: "Configurações",       icon: Settings,    path: "/admin/configuracoes",                       permKey: "settings.view" },
  { label: "Webhook",             icon: Webhook,     path: "/admin/configuracoes?tab=webhook",           permKey: null },
  { label: "Segurança",           icon: ShieldCheck, path: "/admin/configuracoes?tab=seguranca",         permKey: "security.view" },
  { label: "Permissões do Editor",icon: KeyRound,    path: "/admin/configuracoes?tab=permissoes",        permKey: null },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
  topbarExtra?: React.ReactNode;
}

const LS_SIDEBAR = "admin_sidebar_color";
const LS_ACCENT  = "admin_accent_color";
const LS_PERMS   = "editor_permissions_cache";

let _cachedLogo: string | null = null;
let _fetchPromise: Promise<void> | null = null;

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

// ─── Editor permission hook ───────────────────────────────────────────────────

let _permPromise: Promise<void> | null = null;
let _cachedPerms: Set<string> | null = null;

function useEditorPermissions(role: string): { permSet: Set<string>; loaded: boolean } {
  const [permSet, setPermSet] = useState<Set<string>>(() => {
    if (role !== "editor") return new Set<string>();
    try {
      const raw = localStorage.getItem(LS_PERMS);
      if (raw) return new Set<string>(JSON.parse(raw) as string[]);
    } catch {}
    return new Set<string>();
  });
  const [loaded, setLoaded] = useState(role !== "editor" || _cachedPerms !== null);

  const fetchPerms = useCallback(() => {
    if (role !== "editor") return;
    if (_cachedPerms) { setPermSet(_cachedPerms); setLoaded(true); return; }
    if (!_permPromise) {
      _permPromise = adminApi.getMyPermissions()
        .then(({ permissions }) => {
          _cachedPerms = new Set(permissions);
          try { localStorage.setItem(LS_PERMS, JSON.stringify(permissions)); } catch {}
          setPermSet(_cachedPerms);
          setLoaded(true);
        })
        .catch(() => { _permPromise = null; setLoaded(true); });
    }
  }, [role]);

  useEffect(() => { fetchPerms(); }, [fetchPerms]);

  return { permSet, loaded };
}

function invalidatePermissionsCache() {
  _cachedPerms = null;
  _permPromise = null;
  try { localStorage.removeItem(LS_PERMS); } catch {}
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
        className="relative p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
            style={{ backgroundColor: accent }}>{unread}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden"
          style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.18)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Notificações</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: accent }}>{unread}</span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-[#0B2A66] dark:hover:text-blue-400 transition-colors">
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
                <div key={n.id} className={`flex gap-3 px-4 py-3 border-b dark:border-slate-700/50 transition-colors ${n.read ? "bg-white dark:bg-slate-900" : "bg-blue-50/40 dark:bg-blue-900/10"}`}>
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: NOTIF_BG[n.type] }}>
                    <NIcon size={14} style={{ color: NOTIF_COLOR[n.type] }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-[12px] font-semibold leading-tight ${n.read ? "text-slate-600 dark:text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>{n.title}</p>
                      <button onClick={() => dismiss(n.id)} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 shrink-0 mt-0.5"><X size={12} /></button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{n.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 text-center">
            <button className="text-[11px] font-medium text-[#0B2A66] dark:text-blue-400 hover:underline">Ver todas as notificações</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ src, initials, size = 9 }: { src?: string | null; initials: string; size?: number }) {
  const dim = `w-${size} h-${size}`;
  if (src) return <img src={src} alt="avatar" className={`${dim} rounded-full object-cover shrink-0 border-2 border-white/30`} />;
  return <div className={`${dim} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-[#0B2A66]`}>{initials}</div>;
}

function ProfileModal({ onClose, onSaved, isDark }: { onClose: () => void; onSaved: (name: string, avatar: string | null) => void; isDark: boolean }) {
  const stored  = getStoredUser();
  const [name, setName]       = useState(stored?.name ?? "");
  const [preview, setPreview] = useState<string | null>(stored?.avatarBase64 ?? null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const fileRef               = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Resize to max 256×256 JPEG before storing — keeps base64 under ~50kb
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setPreview(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const res = await adminApi.updateMyProfile({ name: name.trim() || undefined, avatarBase64: preview });
      onSaved(res.user.name, res.user.avatarBase64 ?? null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "AD";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }} onClick={onClose}>
      <div className={`${isDark ? "bg-slate-900 border border-slate-700" : "bg-white"} rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className={`text-base font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>Meu Perfil</h2>
          <button onClick={onClose} className={`${isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}><X size={18}/></button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar src={preview} initials={initials} size={20} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#0B2A66] text-white flex items-center justify-center shadow-md hover:bg-[#0a2255] transition-colors"
            ><Camera size={13}/></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile}/>
          {preview && (
            <button onClick={() => setPreview(null)} className="text-[11px] text-red-400 hover:text-red-600 underline">
              Remover foto
            </button>
          )}
        </div>

        <div className="space-y-1">
          <label className={`block text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>Nome de exibição</label>
          <div className="relative">
            <Pencil size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-500" : "text-slate-400"}`}/>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full pl-8 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/30 ${isDark ? "bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500" : "border-slate-200 text-slate-800"}`}
              placeholder="Seu nome"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className={`flex-1 py-2 rounded-xl border text-sm transition-colors ${isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            Cancelar
          </button>
          <button
            onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-[#0B2A66] text-white text-sm font-medium hover:bg-[#0a2255] disabled:opacity-60 transition-colors"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ onLogout, isDark, onToggleDark }: { onLogout: () => void; isDark: boolean; onToggleDark: () => void }) {
  const [open, setOpen]         = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [localUser, setLocalUser]     = useState(getStoredUser);
  const ref                     = useRef<HTMLDivElement>(null);
  const initials = (localUser?.name ?? "AD").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel = localUser?.role === "admin" ? "Administrador" : "Editor";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleProfileSaved(name: string, avatar: string | null) {
    const updated = { ...(localUser ?? { email: "", role: "editor" }), name, avatarBase64: avatar ?? undefined };
    setStoredUser(updated);
    setLocalUser(updated);
  }

  return (
    <>
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onSaved={handleProfileSaved}
          isDark={isDark}
        />
      )}
      <div ref={ref} className="relative">
        <button onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <Avatar src={localUser?.avatarBase64} initials={initials} size={9} />
          <div className="hidden lg:block text-left">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-none">{localUser?.name ?? "Usuário"}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{roleLabel}</p>
          </div>
          <ChevronDown size={13} className={`text-slate-400 transition-transform hidden lg:block ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-[230px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden py-1.5"
            style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.18)" }}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Avatar src={localUser?.avatarBase64} initials={initials} size={10} />
                <div>
                  <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-none">{localUser?.name ?? "Usuário"}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{localUser?.email ?? ""}</p>
                </div>
              </div>
            </div>
            <div className="py-1">
              <button onClick={() => { setShowProfile(true); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#0B2A66] dark:hover:text-blue-400 transition-colors text-left">
                <UserCircle size={15} className="text-slate-400 dark:text-slate-500"/> Meu Perfil
              </button>
              <button onClick={() => { window.open("/", "_blank"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#0B2A66] dark:hover:text-blue-400 transition-colors text-left">
                <Eye size={15} className="text-slate-400 dark:text-slate-500"/> Ver portal
              </button>
              <button onClick={() => { onToggleDark(); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                <span className="flex items-center gap-3">
                  {isDark ? <Sun size={15} className="text-amber-400"/> : <Moon size={15} className="text-slate-400"/>}
                  {isDark ? "Modo Claro" : "Modo Escuro"}
                </span>
                <span className={`w-8 h-4 rounded-full relative transition-colors ${isDark ? "bg-[#0B2A66]" : "bg-slate-200"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isDark ? "translate-x-4" : "translate-x-0.5"}`}/>
                </span>
              </button>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 py-1">
              <button onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors text-left">
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function AdminLayout({ children, title, noPadding, topbarExtra }: AdminLayoutProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => getAdminDarkMode());
  const [location, navigate] = useLocation();
  const { accent, logo } = usePanelTheme();
  const user = getStoredUser();
  const role = user?.role ?? "editor";

  function toggleDark() {
    setIsDark((d) => {
      const next = !d;
      setAdminDarkMode(next);
      return next;
    });
  }

  const { permSet, loaded } = useEditorPermissions(role);

  function canSee(permKey: string | null): boolean {
    if (role === "admin") return true;
    if (permKey === null) return false;
    return permSet.has(permKey);
  }

  const visibleMain   = NAV_MAIN.filter((i) => canSee(i.permKey));
  const visibleConfig = NAV_CONFIG.filter((i) => canSee(i.permKey));
  const inConfig      = visibleConfig.some((i) => location.startsWith(i.path));

  useEffect(() => {
    if (inConfig) setConfigOpen(true);
  }, [inConfig]);

  function handleLogout() {
    clearAuth();
    invalidatePermissionsCache();
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
            ? "text-[#0B2A66] dark:text-blue-300 font-semibold bg-[#EEF2FF] dark:bg-blue-950/60"
            : "text-slate-500 dark:text-slate-400 hover:text-[#0B2A66] dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
          }`}
      >
        {active && (
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full" style={{ backgroundColor: accent }} />
        )}
        <Icon size={17} className={active ? "text-[#0B2A66] dark:text-blue-300" : "text-slate-400 dark:text-slate-500"} />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <div className={`flex h-screen transition-colors duration-200 ${isDark ? "dark" : ""}`}
      style={{ background: isDark ? "#0F172A" : "#F7F9FC", fontFamily: "Inter, sans-serif" }}>

      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="w-[260px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-700 flex flex-col h-full overflow-y-auto">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-700">
          <img src={logo} alt="SBC Agora" className="h-9 w-auto object-contain" />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 tracking-wide">A notícia em tempo real</p>
        </div>

        {/* Papel do usuário */}
        {role === "editor" && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Acesso Editor</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
              {loaded ? `${permSet.size} permissões ativas` : "Carregando permissões..."}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 pr-2">
          {visibleMain.map(({ label, icon: Icon, path }) => navItem(label, Icon, path))}

          {/* Configurações group */}
          {visibleConfig.length > 0 && (
            <div className="pt-3">
              <button
                onClick={() => setConfigOpen((o) => !o)}
                className={`w-full flex items-center gap-3 pl-5 pr-4 py-2.5 text-sm transition-colors rounded-r-xl
                  ${inConfig
                    ? "text-[#0B2A66] dark:text-blue-300 font-semibold bg-[#EEF2FF] dark:bg-blue-950/60"
                    : "text-slate-500 dark:text-slate-400 hover:text-[#0B2A66] dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"}`}
              >
                <Settings size={17} className={inConfig ? "text-[#0B2A66] dark:text-blue-300" : "text-slate-400 dark:text-slate-500"} />
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
        <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-4 space-y-1">
          <a href="/" target="_blank" rel="noreferrer"
            className="flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 dark:text-slate-400 hover:text-[#0B2A66] dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <ExternalLink size={16} className="text-slate-400 dark:text-slate-500" />
            <span>Ver site</span>
          </a>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-r-xl text-sm text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors">
            <LogOut size={16} className="text-slate-400 dark:text-slate-500" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-[72px] bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 px-8 flex items-center gap-6 shrink-0">
          <h1 className="text-xl font-bold text-[#0B2A66] dark:text-blue-300 shrink-0">{title}</h1>
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input type="text" placeholder="Buscar no portal..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-[#0B2A66] dark:focus:border-blue-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {topbarExtra ? topbarExtra : (
              <>
                <span className="text-sm text-slate-500 dark:text-slate-400 hidden lg:flex items-center gap-2">
                  <span className="text-slate-400">📅</span> {formatDate()}
                </span>
                <button onClick={toggleDark}
                  title={isDark ? "Modo claro" : "Modo escuro"}
                  className="p-2 rounded-xl text-slate-500 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  {isDark ? <Sun size={18}/> : <Moon size={18}/>}
                </button>
                <NotificationBell accent={accent} />
                <UserMenu onLogout={handleLogout} isDark={isDark} onToggleDark={toggleDark} />
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
