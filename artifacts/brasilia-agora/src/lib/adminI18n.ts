/**
 * i18n do PAINEL admin — por USUÁRIO (não confundir com `lib/i18n.ts`, que é do
 * site público e é dirigido por `settings.siteLanguage`).
 *
 * O idioma vem do campo `language` do usuário logado (snapshot em localStorage,
 * via `getStoredUser().language`). Trocar o idioma no "Meu Perfil" recarrega o
 * painel, então basta uma leitura síncrona aqui — sem reatividade extra.
 *
 * Chaves ainda não traduzidas caem em pt-BR por construção (o valor PT é o
 * literal atual). A cobertura cresce por página, sem quebrar nada no caminho.
 */
export type AdminLang = "pt-BR" | "en";

const PT = {
  // ── Navegação (sidebar) ───────────────────────────────────────────────
  "nav.dashboard": "Dashboard",
  "nav.analytics": "Analytics",
  "nav.articles": "Artigos",
  "nav.menu": "Menu",
  "nav.homeBlocks": "Blocos Home",
  "nav.categories": "Categorias",
  "nav.ads": "Propagandas",
  "nav.columnists": "Colunistas",
  "nav.rss": "Fontes RSS",
  "nav.users": "Usuários",
  "nav.social": "Redes Sociais",
  "nav.settings": "Configurações",
  "nav.tagline": "A notícia em tempo real",

  // ── Papéis / caixa de acesso do editor ────────────────────────────────
  "role.admin": "Administrador",
  "role.editor": "Editor",
  "shell.editorAccess": "Acesso Editor",
  "shell.permsActive": "permissões ativas",
  "shell.loadingPerms": "Carregando permissões...",

  // ── Topbar ────────────────────────────────────────────────────────────
  "shell.searchPlaceholder": "Buscar no portal...",
  "shell.viewSite": "Ver site",
  "shell.logout": "Sair",
  "topbar.darkMode": "Modo escuro",
  "topbar.lightMode": "Modo claro",

  // ── Menu do usuário ───────────────────────────────────────────────────
  "menu.myProfile": "Meu Perfil",
  "menu.viewPortal": "Ver portal",
  "menu.toLight": "Modo Claro",
  "menu.toDark": "Modo Escuro",

  // ── Notificações ──────────────────────────────────────────────────────
  "notif.title": "Notificações",
  "notif.markAll": "Marcar todas como lidas",
  "notif.empty": "Nenhuma notificação",
  "notif.viewAll": "Ver todas as notificações",

  // ── Modal de perfil ───────────────────────────────────────────────────
  "profile.title": "Meu Perfil",
  "profile.displayName": "Nome de exibição",
  "profile.yourName": "Seu nome",
  "profile.removePhoto": "Remover foto",
  "profile.language": "Idioma do painel",
  "profile.cancel": "Cancelar",
  "profile.save": "Salvar",
  "profile.saving": "Salvando…",
  "profile.errorSave": "Erro ao salvar",

  // ── Acesso restrito (guarda de rota) ──────────────────────────────────
  "access.title": "Acesso Restrito",
  "access.msg": "Você não tem permissão para visualizar esta página.",
  "access.back": "Voltar ao Dashboard",

  // ── Login ─────────────────────────────────────────────────────────────
  "login.title": "Painel Administrativo",
  "login.subtitle": "Faça login para continuar",
  "login.email": "E-mail",
  "login.password": "Senha",
  "login.submit": "Entrar",
  "login.submitting": "Entrando…",
  "login.2faTitle": "Verificação em duas etapas",
  "login.2faSubtitle": "Digite o código do seu app autenticador",
  "login.2faCode": "Código de 6 dígitos",
  "login.2faVerify": "Verificar",
  "login.2faVerifying": "Verificando…",
  "login.2faBack": "Voltar",
} as const;

export type AdminTKey = keyof typeof PT;

const EN: Record<AdminTKey, string> = {
  "nav.dashboard": "Dashboard",
  "nav.analytics": "Analytics",
  "nav.articles": "Articles",
  "nav.menu": "Menu",
  "nav.homeBlocks": "Home Blocks",
  "nav.categories": "Categories",
  "nav.ads": "Ads",
  "nav.columnists": "Columnists",
  "nav.rss": "RSS Feeds",
  "nav.users": "Users",
  "nav.social": "Social Media",
  "nav.settings": "Settings",
  "nav.tagline": "News in real time",

  "role.admin": "Administrator",
  "role.editor": "Editor",
  "shell.editorAccess": "Editor access",
  "shell.permsActive": "active permissions",
  "shell.loadingPerms": "Loading permissions...",

  "shell.searchPlaceholder": "Search the portal...",
  "shell.viewSite": "View site",
  "shell.logout": "Log out",
  "topbar.darkMode": "Dark mode",
  "topbar.lightMode": "Light mode",

  "menu.myProfile": "My Profile",
  "menu.viewPortal": "View portal",
  "menu.toLight": "Light Mode",
  "menu.toDark": "Dark Mode",

  "notif.title": "Notifications",
  "notif.markAll": "Mark all as read",
  "notif.empty": "No notifications",
  "notif.viewAll": "View all notifications",

  "profile.title": "My Profile",
  "profile.displayName": "Display name",
  "profile.yourName": "Your name",
  "profile.removePhoto": "Remove photo",
  "profile.language": "Panel language",
  "profile.cancel": "Cancel",
  "profile.save": "Save",
  "profile.saving": "Saving…",
  "profile.errorSave": "Error saving",

  "access.title": "Restricted Access",
  "access.msg": "You don't have permission to view this page.",
  "access.back": "Back to Dashboard",

  "login.title": "Admin Panel",
  "login.subtitle": "Sign in to continue",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.2faTitle": "Two-step verification",
  "login.2faSubtitle": "Enter the code from your authenticator app",
  "login.2faCode": "6-digit code",
  "login.2faVerify": "Verify",
  "login.2faVerifying": "Verifying…",
  "login.2faBack": "Back",
};

const ADICT: Record<AdminLang, Record<AdminTKey, string>> = { "pt-BR": PT, en: EN };

/** Idioma do painel do usuário logado (síncrono, do snapshot em localStorage).
 *  Lê o cru para não criar dependência circular com `pages/Admin`. */
export function resolveAdminLang(): AdminLang {
  try {
    const raw = localStorage.getItem("admin_user");
    if (!raw) return "pt-BR";
    return (JSON.parse(raw) as { language?: string }).language === "en" ? "en" : "pt-BR";
  } catch {
    return "pt-BR";
  }
}

/** Tradutor fora de componentes React. */
export function adminT(key: AdminTKey): string {
  return ADICT[resolveAdminLang()][key] ?? PT[key];
}

/** Hook para componentes. O idioma só muda via "Meu Perfil", que recarrega o
 *  painel — logo, ler no render é suficiente. */
export function useAdminT(): { t: (k: AdminTKey) => string; lang: AdminLang } {
  const lang = resolveAdminLang();
  return { t: (k) => ADICT[lang][k] ?? PT[k], lang };
}
