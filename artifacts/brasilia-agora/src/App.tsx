import { Switch, Route, Router as WouterRouter, useParams, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import SEOHead from "@/components/SEOHead";
import { useAnalytics } from "@/hooks/useAnalytics";
import { lazy, Suspense, useState, useEffect } from "react";

/* ─── Eager — crítico para o carregamento inicial ─── */
import Home from "@/pages/Home";
import { RequireAuth, RequireAdmin } from "@/pages/Admin";

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
      RSSManager, UsersManager, SecurityCheckup, EditorPermissions, SocialMedia,
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

interface MenuItemApi { label: string; path: string; visible?: boolean; }

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
        const found = (d.menuItems ?? []).find(
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

function Router() {
  const [location] = useLocation();
  const isAdminArea = /^\/admin(\/|$)/.test(location) && location !== "/admin/login";

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

        <Route path="/admin/artigos/novo">
          <RequireAdmin><ArticleEdit /></RequireAdmin>
        </Route>
        <Route path="/admin/artigos/:id">
          <RequireAdmin><ArticleEdit /></RequireAdmin>
        </Route>
        <Route path="/admin/artigos">
          <RequireAdmin><Articles /></RequireAdmin>
        </Route>
        <Route path="/admin/home-blocos">
          <RequireAdmin><HomeBlocksManager /></RequireAdmin>
        </Route>
        <Route path="/admin/colunistas">
          <RequireAdmin><ColumnistsManager /></RequireAdmin>
        </Route>
        <Route path="/admin/rss">
          <RequireAdmin><RSSManager /></RequireAdmin>
        </Route>
        <Route path="/admin/webhook">
          <RequireAdmin><Webhook /></RequireAdmin>
        </Route>
        <Route path="/admin/configuracoes">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/2fa-setup">
          <RequireAdmin><TwoFactorSetup /></RequireAdmin>
        </Route>
        <Route path="/admin/logo">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/contato">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/usuarios">
          <RequireAdmin><UsersManager /></RequireAdmin>
        </Route>
        <Route path="/admin/logs">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/settings">
          <RequireAdmin><Settings /></RequireAdmin>
        </Route>
        <Route path="/admin/seguranca">
          <RequireAdmin><SecurityCheckup /></RequireAdmin>
        </Route>
        <Route path="/admin/permissoes">
          <RequireAdmin><EditorPermissions /></RequireAdmin>
        </Route>
        <Route path="/admin/social">
          <RequireAdmin><SocialMedia /></RequireAdmin>
        </Route>
        <Route path="/admin/menu">
          <RequireAuth><MenuManager /></RequireAuth>
        </Route>
        <Route path="/admin/propagandas">
          <RequireAuth><AdsManager /></RequireAuth>
        </Route>
        <Route path="/admin/analytics">
          <RequireAuth><Analytics /></RequireAuth>
        </Route>
        <Route path="/admin">
          <RequireAuth><Dashboard /></RequireAuth>
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
