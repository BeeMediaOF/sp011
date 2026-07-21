import { Switch, Route, Router as WouterRouter, useParams, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import SEOHead from "@/components/SEOHead";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useT } from "@/lib/i18n";
import { lazy, Suspense, useState, useEffect } from "react";

/* ─── Eager — crítico para o carregamento inicial ─── */
import Home from "@/pages/Home";
import { RequireAdmin, RequirePermission } from "@/pages/Admin";

/* ─── Lazy — páginas públicas (carregam só quando navegadas) ─── */
const Artigo           = lazy(() => import("@/pages/Artigo"));
const Politica         = lazy(() => import("@/pages/Politica"));
const Cidade           = lazy(() => import("@/pages/Cidade"));
const Seguranca        = lazy(() => import("@/pages/Seguranca"));
const Transporte       = lazy(() => import("@/pages/Transporte"));
const Saude            = lazy(() => import("@/pages/Saude"));
const Educacao         = lazy(() => import("@/pages/Educacao"));
const Cultura          = lazy(() => import("@/pages/Cultura"));
const Esportes         = lazy(() => import("@/pages/Esportes"));
const Colunas          = lazy(() => import("@/pages/Colunas"));
const Brasil           = lazy(() => import("@/pages/Brasil"));
const Mundo            = lazy(() => import("@/pages/Mundo"));
const Economia         = lazy(() => import("@/pages/Economia"));
const Tecnologia       = lazy(() => import("@/pages/Tecnologia"));
const Archive          = lazy(() => import("@/pages/Archive"));
const Contato          = lazy(() => import("@/pages/Contato"));
const Privacidade      = lazy(() => import("@/pages/Privacidade"));
const Termos           = lazy(() => import("@/pages/Termos"));
const CategoryArchivePage = lazy(() => import("@/pages/CategoryArchivePage"));

/* ─── Lazy — UI não-crítica para o primeiro paint (carrega após o conteúdo) ─── */
const Toaster = lazy(() => import("@/components/ui/toaster").then((m) => ({ default: m.Toaster })));
const LGPDConsent = lazy(() => import("@/components/LGPDConsent"));

/* ─── Lazy com preload — permite pré-carregar o chunk antes da navegação ─── */
type Preloadable<T extends React.ComponentType<unknown>> =
  React.LazyExoticComponent<T> & { preload: () => Promise<{ default: T }> };

function lazyWithPreload<T extends React.ComponentType<never>>(
  factory: () => Promise<{ default: T }>,
): Preloadable<T> {
  let promise: Promise<{ default: T }> | undefined;
  const load = () => (promise ??= factory());
  const Comp = lazy(load) as Preloadable<T>;
  Comp.preload = load;
  return Comp;
}

/* ─── Lazy — páginas admin (jamais carregadas por visitantes) ─── */
const Login            = lazy(() => import("@/pages/admin/Login"));
const Setup            = lazy(() => import("@/pages/admin/Setup"));
/* Shell persistente do painel: sidebar + topbar montados uma única vez acima
   das rotas admin — trocar de aba não remonta o layout ("flash" de reload). */
const loadAdminShell   = () => import("@/components/admin/AdminLayout").then((m) => ({ default: m.AdminShell }));
const AdminShell       = lazy(loadAdminShell);
const Dashboard        = lazyWithPreload(() => import("@/pages/admin/Dashboard"));
const Articles         = lazyWithPreload(() => import("@/pages/admin/Articles"));
const ArticleEdit      = lazyWithPreload(() => import("@/pages/admin/ArticleEdit"));
const MenuManager      = lazyWithPreload(() => import("@/pages/admin/MenuManager"));
const Settings         = lazyWithPreload(() => import("@/pages/admin/Settings"));
const TwoFactorSetup   = lazyWithPreload(() => import("@/pages/admin/TwoFactorSetup"));
const Webhook          = lazyWithPreload(() => import("@/pages/admin/Webhook"));
const AdsManager       = lazyWithPreload(() => import("@/pages/admin/AdsManager"));
const ColumnistsManager = lazyWithPreload(() => import("@/pages/admin/ColumnistsManager"));
const Analytics        = lazyWithPreload(() => import("@/pages/admin/Analytics"));
const HomeBlocksManager = lazyWithPreload(() => import("@/pages/admin/HomeBlocksManager"));
const CategoriesManager = lazyWithPreload(() => import("@/pages/admin/CategoriesManager"));
const RSSManager       = lazyWithPreload(() => import("@/pages/admin/RSSManager"));
const UsersManager     = lazyWithPreload(() => import("@/pages/admin/UsersManager"));
const SecurityCheckup  = lazyWithPreload(() => import("@/pages/admin/SecurityCheckup"));
const EditorPermissions = lazyWithPreload(() => import("@/pages/admin/EditorPermissions"));
const SocialMedia      = lazyWithPreload(() => import("@/pages/admin/SocialMedia"));

/* Pré-carrega todos os chunks do admin uma vez, em segundo plano, para que a
   troca entre abas seja instantânea (sem o flash do spinner de tela cheia). */
let _adminPreloaded = false;
function preloadAdminPages() {
  if (_adminPreloaded) return;
  _adminPreloaded = true;
  const run = () => {
    loadAdminShell().catch(() => {});
    for (const c of [
      Dashboard, Articles, ArticleEdit, MenuManager, Settings, TwoFactorSetup,
      Webhook, AdsManager, ColumnistsManager, Analytics, HomeBlocksManager,
      CategoriesManager, RSSManager, UsersManager, SecurityCheckup, EditorPermissions, SocialMedia,
    ]) {
      c.preload().catch(() => {});
    }
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run);
  else setTimeout(run, 200);
}

/* ─── QueryClient com cache sensato ─── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           60_000,      // dados são "frescos" por 1 min
      gcTime:              5 * 60_000,  // mantém em cache por 5 min
      refetchOnWindowFocus: false,      // não re-busca ao focar a aba
      retry:               1,
    },
  },
});

/* ─── Fallback visual mínimo para Suspense ─── */
function PageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="w-8 h-8 border-4 border-[#0B2A66] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const COLOR_PALETTE = [
  "#0b3d91","#c8102e","#16a34a","#6b21a8","#0284c7",
  "#b45309","#0d9488","#dc2626","#ea580c","#7c3aed",
];

function colorForSlug(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length]!;
}

interface MenuItemApi { label: string; path: string; visible?: boolean; children?: MenuItemApi[]; }

function DynamicCategory() {
  const { slug } = useParams<{ slug: string }>();
  const [menuItem, setMenuItem] = useState<MenuItemApi | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) { setMenuItem(null); return; }
    // /api/site é público e já inclui os menuItems visíveis — /api/admin/menu
    // exige token e devolvia 401 para visitantes anônimos (NotFound indevido).
    fetch("/api/site")
      .then((r) => r.json())
      .then((d: { menuItems: MenuItemApi[] }) => {
        // Procura o slug nos itens de topo e nos submenus (1 nível).
        const flat = (d.menuItems ?? []).flatMap((m) => [m, ...(m.children ?? [])]);
        const found = flat.find(
          (m) => m.path === `/${slug}` || m.path.replace(/^\//, "") === slug
        );
        setMenuItem(found ?? null);
      })
      .catch(() => setMenuItem(null));
  }, [slug]);

  if (menuItem === undefined) return null;
  if (!menuItem) return <NotFound />;

  return (
    <CategoryArchivePage
      category={menuItem.label.toUpperCase()}
      slug={slug ?? ""}
      color={colorForSlug(slug ?? "")}
    />
  );
}

function AnalyticsProvider() {
  useAnalytics();
  return null;
}

/**
 * Navegação SPA não mexe no scroll: quem abria uma notícia com a home rolada
 * "caía no meio" do artigo (pior no celular). Toda troca de rota via link volta
 * ao topo; voltar/avançar do navegador (popstate) preserva a posição que o
 * próprio browser restaura (history.scrollRestoration = "auto").
 */
let _isPopNavigation = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { _isPopNavigation = true; });
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (_isPopNavigation) {
      _isPopNavigation = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

/** Mantém <html lang> sincronizado com settings.siteLanguage nas rotas SPA
    (o HTML SSR da home já sai com o lang certo via ssrHomePlugin). */
function LangSync() {
  const { lang } = useT();
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);
  return null;
}

/** Placeholder neutro para imagem quebrada (URL morta/bloqueada na origem). */
const BROKEN_IMG_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 675'>" +
    "<rect width='1200' height='675' fill='#e5e7eb'/>" +
    "<path d='M540 296h120a8 8 0 0 1 8 8v80a8 8 0 0 1-8 8H540a8 8 0 0 1-8-8v-80a8 8 0 0 1 8-8zm10 74 26-32 18 22 12-14 24 24z' fill='#9ca3af'/>" +
    "<circle cx='560' cy='318' r='9' fill='#9ca3af'/>" +
    "</svg>",
  );

/** Troca <img> quebradas pelo placeholder — listener delegado em fase de
    captura (o evento error de imagem não borbulha); vale para o site inteiro,
    inclusive cards de notícia com imagem de origem que morreu depois. */
function BrokenImageFallback() {
  useEffect(() => {
    function onError(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.dataset["brokenFallback"] === "1") return;
      el.dataset["brokenFallback"] = "1";
      el.srcset = "";
      el.src = BROKEN_IMG_PLACEHOLDER;
    }
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}

function Router() {
  const [location] = useLocation();
  const isAdminArea =
    /^\/admin(\/|$)/.test(location) && location !== "/admin/login" && location !== "/admin/setup";

  // Ao entrar no admin, pré-carrega os chunks das demais abas em segundo plano
  // para que a navegação entre elas fique instantânea.
  useEffect(() => {
    if (isAdminArea) {
      preloadAdminPages();
    }
  }, [isAdminArea]);

  const routes = (
      <Switch>
        {/* ── Admin routes ── */}
        <Route path="/admin/login" component={Login} />
        {/* Assistente de instalação — instância nova sem banco (sem auth) */}
        <Route path="/admin/setup" component={Setup} />

        <Route path="/admin/artigos/novo">
          <RequirePermission perm="articles.create"><ArticleEdit /></RequirePermission>
        </Route>
        <Route path="/admin/artigos/:id">
          <RequirePermission perm="articles.edit"><ArticleEdit /></RequirePermission>
        </Route>
        <Route path="/admin/artigos">
          <RequirePermission perm="articles.view"><Articles /></RequirePermission>
        </Route>
        <Route path="/admin/home-blocos">
          <RequirePermission perm="home_blocks.view"><HomeBlocksManager /></RequirePermission>
        </Route>
        <Route path="/admin/categorias">
          <RequirePermission perm="categories.view"><CategoriesManager /></RequirePermission>
        </Route>
        <Route path="/admin/colunistas">
          <RequirePermission perm="columnists.view"><ColumnistsManager /></RequirePermission>
        </Route>
        <Route path="/admin/rss">
          <RequirePermission perm="rss.view"><RSSManager /></RequirePermission>
        </Route>
        <Route path="/admin/webhook">
          <RequireAdmin><Webhook /></RequireAdmin>
        </Route>
        <Route path="/admin/configuracoes">
          <RequirePermission perm="settings.view"><Settings /></RequirePermission>
        </Route>
        <Route path="/admin/2fa-setup">
          <RequireAdmin><TwoFactorSetup /></RequireAdmin>
        </Route>
        <Route path="/admin/logo">
          <RequirePermission perm="settings.view"><Settings /></RequirePermission>
        </Route>
        <Route path="/admin/contato">
          <RequirePermission perm="settings.view"><Settings /></RequirePermission>
        </Route>
        <Route path="/admin/usuarios">
          <RequireAdmin><UsersManager /></RequireAdmin>
        </Route>
        <Route path="/admin/logs">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/settings">
          <RequirePermission perm="settings.view"><Settings /></RequirePermission>
        </Route>
        <Route path="/admin/seguranca">
          <RequireAdmin><SecurityCheckup /></RequireAdmin>
        </Route>
        <Route path="/admin/permissoes">
          <RequireAdmin><EditorPermissions /></RequireAdmin>
        </Route>
        <Route path="/admin/social">
          <RequirePermission perm="social.view"><SocialMedia /></RequirePermission>
        </Route>
        <Route path="/admin/menu">
          <RequirePermission perm="menu.view"><MenuManager /></RequirePermission>
        </Route>
        <Route path="/admin/propagandas">
          <RequirePermission perm="ads.view"><AdsManager /></RequirePermission>
        </Route>
        <Route path="/admin/analytics">
          <RequirePermission perm="analytics.view"><Analytics /></RequirePermission>
        </Route>
        <Route path="/admin">
          <RequirePermission perm="dashboard.view"><Dashboard /></RequirePermission>
        </Route>

        {/* ── Public routes ── */}
        <Route path="/" component={Home} />
        <Route path="/politica" component={Politica} />
        <Route path="/cidade" component={Cidade} />
        <Route path="/seguranca" component={Seguranca} />
        <Route path="/transporte" component={Transporte} />
        <Route path="/saude" component={Saude} />
        <Route path="/educacao" component={Educacao} />
        <Route path="/cultura" component={Cultura} />
        <Route path="/esportes" component={Esportes} />
        <Route path="/colunas" component={Colunas} />
        <Route path="/brasil" component={Brasil} />
        <Route path="/mundo" component={Mundo} />
        <Route path="/economia" component={Economia} />
        <Route path="/tecnologia" component={Tecnologia} />
        <Route path="/artigo/:slug" component={Artigo} />
        <Route path="/arquivo" component={Archive} />
        <Route path="/contato" component={Contato} />
        <Route path="/privacidade" component={Privacidade} />
        <Route path="/termos" component={Termos} />
        <Route path="/:slug" component={DynamicCategory} />
        <Route component={NotFound} />
      </Switch>
  );

  return (
    <Suspense fallback={<PageSpinner />}>
      {isAdminArea ? <AdminShell>{routes}</AdminShell> : routes}
    </Suspense>
  );
}

function App({ ssrPath }: { ssrPath?: string } = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter ssrPath={ssrPath} base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AnalyticsProvider />
          <ScrollToTop />
          <LangSync />
          <BrokenImageFallback />
          <SEOHead />
          <Router />
          <Suspense fallback={null}><LGPDConsent /></Suspense>
        </WouterRouter>
        <Suspense fallback={null}><Toaster /></Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
