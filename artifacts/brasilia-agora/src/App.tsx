import { Switch, Route, Router as WouterRouter, useParams } from "wouter";
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

/* ─── Lazy — páginas admin (jamais carregadas por visitantes) ─── */
const Login            = lazy(() => import("@/pages/admin/Login"));
const Dashboard        = lazy(() => import("@/pages/admin/Dashboard"));
const Articles         = lazy(() => import("@/pages/admin/Articles"));
const ArticleEdit      = lazy(() => import("@/pages/admin/ArticleEdit"));
const MenuManager      = lazy(() => import("@/pages/admin/MenuManager"));
const Settings         = lazy(() => import("@/pages/admin/Settings"));
const TwoFactorSetup   = lazy(() => import("@/pages/admin/TwoFactorSetup"));
const Webhook          = lazy(() => import("@/pages/admin/Webhook"));
const AdsManager       = lazy(() => import("@/pages/admin/AdsManager"));
const ColumnistsManager = lazy(() => import("@/pages/admin/ColumnistsManager"));
const Analytics        = lazy(() => import("@/pages/admin/Analytics"));
const HomeBlocksManager = lazy(() => import("@/pages/admin/HomeBlocksManager"));
const RSSManager       = lazy(() => import("@/pages/admin/RSSManager"));
const UsersManager     = lazy(() => import("@/pages/admin/UsersManager"));
const SecurityCheckup  = lazy(() => import("@/pages/admin/SecurityCheckup"));
const EditorPermissions = lazy(() => import("@/pages/admin/EditorPermissions"));
const SocialMedia      = lazy(() => import("@/pages/admin/SocialMedia"));

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
    fetch("/api/admin/menu")
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
  return (
    <Suspense fallback={<PageSpinner />}>
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
