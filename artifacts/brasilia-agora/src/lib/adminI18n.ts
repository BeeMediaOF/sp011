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

  // ── Comuns ────────────────────────────────────────────────────────────
  "common.loading": "Carregando…",

  // ── Dashboard ─────────────────────────────────────────────────────────
  "dash.portalUp": "Portal no ar",
  "dash.online": "Seu portal está online e funcionando normalmente.",
  "dash.publishedArticles": "artigos publicados",
  "dash.activeAds": "propagandas ativas",
  "dash.kpiPublished": "Publicados",
  "dash.kpiPublishedSub": "total no portal",
  "dash.kpiDrafts": "Rascunhos",
  "dash.kpiDraftsSub": "aguardando revisão",
  "dash.kpiViewsToday": "Views hoje",
  "dash.vsYesterday": "vs ontem",
  "dash.kpiViews7d": "Views · 7 dias",
  "dash.vsPrev7d": "vs 7 dias anteriores",
  "dash.pageviews7d": "Pageviews — últimos 7 dias",
  "dash.last7days": "Últimos 7 dias",
  "dash.noAccessData": "Sem dados de acesso ainda",
  "dash.recentArticles": "Artigos recentes",
  "dash.seeAll": "Ver todos",
  "dash.seeAllFem": "Ver todas",
  "dash.noArticles": "Nenhum artigo ainda",
  "dash.published": "Publicado",
  "dash.draft": "Rascunho",
  "dash.topCategories": "Top categorias",
  "dash.byViews": "por acessos",
  "dash.noData": "Sem dados",
  "dash.impressions": "Impressões",
  "dash.clicks": "Cliques",
  "dash.adsActiveShort": "Ativas",
  "dash.quickActions": "Ações rápidas",
  "dash.qaNewArticle": "Novo artigo",
  "dash.qaHomeBlocks": "Blocos da home",
  "dash.qaNewAd": "Nova propaganda",
  "dash.qaAddRss": "Adicionar RSS",

  // ── Menu (gerenciador) ────────────────────────────────────────────────
  "menu.mainTitle": "Menu principal",
  "menu.headerDescA": "Menu exibido no cabeçalho do site. A barra superior e o rodapé são editados em",
  "menu.homeBlocksLink": "Blocos da Home",
  "menu.errSave": "Erro ao salvar — tente novamente",
  "menu.createNew": "Criar novo menu",
  "menu.savedBang": "Salvo!",
  "menu.saving": "Salvando…",
  "menu.saveChanges": "Salvar alterações",
  "menu.previewTitle": "Pré-visualização do menu principal",
  "menu.responsive": "Responsivo:",
  "menu.homeItem": "Página inicial",
  "menu.more": "Mais",
  "menu.availableItems": "Itens disponíveis",
  "menu.availableDesc": "Páginas, categorias e links que podem ser adicionados ao menu.",
  "menu.tabPages": "Páginas",
  "menu.tabCategories": "Categorias",
  "menu.tabLinks": "Links personalizados",
  "menu.searchPages": "Buscar páginas...",
  "menu.noCategories": "Nenhuma categoria cadastrada ainda.",
  "menu.addExternalDesc": "Adicione um link externo ou personalizado.",
  "menu.addCustomLink": "Adicionar link personalizado",
  "menu.manageCategories": "Gerenciar categorias",
  "menu.structure": "Estrutura do menu",
  "menu.structureDesc": "Arraste e solte para reordenar. Expanda um item para criar subitens (dropdown no site).",
  "menu.addItem": "Adicionar item",
  "menu.noItems": "Nenhum item no menu",
  "menu.badgeLink": "Link",
  "menu.badgePage": "Página",
  "menu.badgeCategory": "Categoria",
  "menu.addSubitem": "Adicionar subitem",
  "menu.itemSettings": "Configurações do item",
  "menu.editingPrefix": "Editando: ",
  "menu.selectItem": "Selecione um item para editar.",
  "menu.menuText": "Texto do menu",
  "menu.egNews": "Ex: Notícias",
  "menu.path": "Caminho",
  "menu.pathPlaceholder": "/categoria",
  "menu.visibleInMenu": "Visível no menu",
  "menu.visibleDesc": "Exibe este item no menu do site.",
  "menu.tip": "Dica: arraste os itens de topo para definir a ordem; expanda um item e use \"Adicionar subitem\" para montar o dropdown exibido no site.",
  "menu.applyChanges": "Aplicar alterações",
  "menu.selectItemLong": "Selecione um item na estrutura do menu para editar suas configurações.",
  "menu.confirmRemove": "Remover este item do menu?",
  "menu.defNewItem": "Novo item",
  "menu.defNewSubitem": "Novo subitem",
  "menu.defExternalLink": "Link externo",
  "menu.defUnnamed": "Item sem nome",
  "menu.defUnnamedLower": "item sem nome",
  "menuPage.home": "Página Inicial",
  "menuPage.archive": "Arquivo de notícias",
  "menuPage.contact": "Contato",
  "menuPage.terms": "Termos de Uso",
  "menuPage.privacy": "Política de Privacidade",
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

  "common.loading": "Loading…",

  "dash.portalUp": "Portal online",
  "dash.online": "Your portal is online and running normally.",
  "dash.publishedArticles": "published articles",
  "dash.activeAds": "active ads",
  "dash.kpiPublished": "Published",
  "dash.kpiPublishedSub": "total on the portal",
  "dash.kpiDrafts": "Drafts",
  "dash.kpiDraftsSub": "awaiting review",
  "dash.kpiViewsToday": "Views today",
  "dash.vsYesterday": "vs yesterday",
  "dash.kpiViews7d": "Views · 7 days",
  "dash.vsPrev7d": "vs previous 7 days",
  "dash.pageviews7d": "Pageviews — last 7 days",
  "dash.last7days": "Last 7 days",
  "dash.noAccessData": "No traffic data yet",
  "dash.recentArticles": "Recent articles",
  "dash.seeAll": "See all",
  "dash.seeAllFem": "See all",
  "dash.noArticles": "No articles yet",
  "dash.published": "Published",
  "dash.draft": "Draft",
  "dash.topCategories": "Top categories",
  "dash.byViews": "by views",
  "dash.noData": "No data",
  "dash.impressions": "Impressions",
  "dash.clicks": "Clicks",
  "dash.adsActiveShort": "Active",
  "dash.quickActions": "Quick actions",
  "dash.qaNewArticle": "New article",
  "dash.qaHomeBlocks": "Home blocks",
  "dash.qaNewAd": "New ad",
  "dash.qaAddRss": "Add RSS",

  "menu.mainTitle": "Main menu",
  "menu.headerDescA": "Menu shown in the site header. The top bar and footer are edited in",
  "menu.homeBlocksLink": "Home Blocks",
  "menu.errSave": "Error saving — try again",
  "menu.createNew": "Create new menu",
  "menu.savedBang": "Saved!",
  "menu.saving": "Saving…",
  "menu.saveChanges": "Save changes",
  "menu.previewTitle": "Main menu preview",
  "menu.responsive": "Responsive:",
  "menu.homeItem": "Home",
  "menu.more": "More",
  "menu.availableItems": "Available items",
  "menu.availableDesc": "Pages, categories and links that can be added to the menu.",
  "menu.tabPages": "Pages",
  "menu.tabCategories": "Categories",
  "menu.tabLinks": "Custom links",
  "menu.searchPages": "Search pages...",
  "menu.noCategories": "No categories registered yet.",
  "menu.addExternalDesc": "Add an external or custom link.",
  "menu.addCustomLink": "Add custom link",
  "menu.manageCategories": "Manage categories",
  "menu.structure": "Menu structure",
  "menu.structureDesc": "Drag and drop to reorder. Expand an item to create subitems (dropdown on the site).",
  "menu.addItem": "Add item",
  "menu.noItems": "No items in the menu",
  "menu.badgeLink": "Link",
  "menu.badgePage": "Page",
  "menu.badgeCategory": "Category",
  "menu.addSubitem": "Add subitem",
  "menu.itemSettings": "Item settings",
  "menu.editingPrefix": "Editing: ",
  "menu.selectItem": "Select an item to edit.",
  "menu.menuText": "Menu text",
  "menu.egNews": "e.g. News",
  "menu.path": "Path",
  "menu.pathPlaceholder": "/category",
  "menu.visibleInMenu": "Visible in menu",
  "menu.visibleDesc": "Shows this item in the site menu.",
  "menu.tip": "Tip: drag the top-level items to set the order; expand an item and use \"Add subitem\" to build the dropdown shown on the site.",
  "menu.applyChanges": "Apply changes",
  "menu.selectItemLong": "Select an item in the menu structure to edit its settings.",
  "menu.confirmRemove": "Remove this item from the menu?",
  "menu.defNewItem": "New item",
  "menu.defNewSubitem": "New subitem",
  "menu.defExternalLink": "External link",
  "menu.defUnnamed": "Unnamed item",
  "menu.defUnnamedLower": "unnamed item",
  "menuPage.home": "Home Page",
  "menuPage.archive": "News archive",
  "menuPage.contact": "Contact",
  "menuPage.terms": "Terms of Use",
  "menuPage.privacy": "Privacy Policy",
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
