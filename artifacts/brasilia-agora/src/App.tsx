import { Switch, Route, Router as WouterRouter, useParams, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotFound from "@/pages/not-found";
import SEOHead from "@/components/SEOHead";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useSite } from "@/hooks/useSite";
import { useT } from "@/lib/i18n";
import { resolveCategoryRoute, categoryRouteForSlug } from "@/lib/categoryRoutes";
import { readCategorySeed } from "@/lib/categorySeed";
import { lazy, Suspense, useEffect } from "react";

/* ─── Eager — crítico para o carregamento inicial ─── */
import Home from "@/pages/Home";
import { RequireAdmin, RequirePermission } from "@/pages/Admin";

/* ─── Lazy — páginas públicas (carregam só quando navegadas) ─── */
const Artigo           = lazy(() => import("@/pages/Artigo"));
const Archive          = lazy(() => import("@/pages/Archive"));
const Contato          = lazy(() => import("@/pages/Contato"));
const Privacidade      = lazy(() => import("@/pages/Privacidade"));
const Termos           = lazy(() => import("@/pages/Termos"));
const CategoryArchivePage = lazy(() => import("@/pages/CategoryArchivePage"));
const TopNews          = lazy(() => import("@/pages/TopNews"));
const Transfers        = lazy(() => import("@/pages/Transfers"));

/**
 * Componentes que o SSR precisa ter RESOLVIDOS antes de renderizar
 * (PRD-PERF-05). `renderToString` não espera Suspense: com o `lazy` do cliente
 * a página de artigo/editoria sairia do servidor como o <PageSpinner/>. O
 * entry-server importa os dois de forma estática e passa aqui; o bundle do
 * cliente nunca vê este objeto e continua carregando os chunks sob demanda.
 */
export interface SsrPages {
  Artigo: React.ComponentType;
  CategoryArchivePage: React.ComponentType<{ category: string; slug: string; color: string }>;
}

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
const TransfersManager = lazyWithPreload(() => import("@/pages/admin/TransfersManager"));
const Analytics        = lazyWithPreload(() => import("@/pages/admin/Analytics"));
const HomeBlocksManager = lazyWithPreload(() => import("@/pages/admin/HomeBlocksManager"));
const CategoriesManager = lazyWithPreload(() => import("@/pages/admin/CategoriesManager"));
const RSSManager       = lazyWithPreload(() => import("@/pages/admin/RSSManager"));
const UsersManager     = lazyWithPreload(() => import("@/pages/admin/UsersManager"));
const SecurityCheckup  = lazyWithPreload(() => import("@/pages/admin/SecurityCheckup"));
const EditorPermissions = lazyWithPreload(() => import("@/pages/admin/EditorPermissions"));
const SocialMedia      = lazyWithPreload(() => import("@/pages/admin/SocialMedia"));
const Newsletter       = lazyWithPreload(() => import("@/pages/admin/Newsletter"));

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
      Webhook, AdsManager, ColumnistsManager, TransfersManager, Analytics, HomeBlocksManager,
      CategoriesManager, RSSManager, UsersManager, SecurityCheckup, EditorPermissions, SocialMedia,
      Newsletter,
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

/**
 * Editoria de rota livre (`/:slug`): resolve o slug contra o menu do portal.
 * O fetch próprio de /api/site saiu daqui (PRD-PERF-05) — as settings já estão
 * no useSite (semeadas pelo SSR ou pelo cache), então a página não paga mais um
 * round-trip nem renderiza `null` no primeiro quadro da hidratação.
 */
function DynamicCategory({ Page }: { Page: SsrPages["CategoryArchivePage"] }) {
  const { slug } = useParams<{ slug: string }>();
  const { settings, validated } = useSite();

  /* A superfície de editorias inclui as declaradas no painel — inclusive as
     ocultas no menu — e é a MESMA função que o middleware de SSR consulta. */
  const route = resolveCategoryRoute(`/${slug ?? ""}`, settings?.menuItems, settings?.categories);
  if (route) return <Page category={route.label} slug={route.slug} color={route.color} />;
  /* Fora da superfície, mas o SERVIDOR decidiu que a editoria existe por ter
     conteúdo publicado (arquivo histórico) e deixou a semente. Sem este ramo, a
     hidratação apagaria a página que o SSR acabou de pintar — é o caso do
     /seguranca no sp011, 163 artigos fora do menu. */
  const historic = slug ? readCategorySeed(slug) : null;
  const historicRoute = historic ? categoryRouteForSlug(slug!) : null;
  if (historicRoute) {
    return <Page category={historicRoute.label} slug={historicRoute.slug} color={historicRoute.color} />;
  }
  /* Menu ainda não confirmado (só o cache do localStorage, que pode ser anterior
     à criação desta editoria) → nada na tela, nunca um "não encontrado" que
     pisca e some. */
  if (!validated) return null;
  return <NotFound />;
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

function Router({ pages }: { pages?: SsrPages }) {
  /* No SSR os dois componentes vêm resolvidos (ver SsrPages); no cliente são os
     lazy de sempre. Mesmo elemento, mesma árvore — a hidratação casa. */
  const ArtigoPage = pages?.Artigo ?? Artigo;
  const CategoryPage = pages?.CategoryArchivePage ?? CategoryArchivePage;
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
        <Route path="/admin/transferencias">
          <RequirePermission perm="transfers.view"><TransfersManager /></RequirePermission>
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
        <Route path="/admin/newsletter">
          <RequirePermission perm="settings.view"><Newsletter /></RequirePermission>
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
        {/* As 13 rotas fixas saíram daqui: elas faziam TODO blog da rede
            responder /politica, /cidade, /transporte… mesmo sendo um portal de
            esporte sem um único artigo nessas editorias. Quem existe agora sai
            da superfície do próprio blog, resolvida no `/:slug` abaixo pela
            mesma função que o middleware de SSR usa. */}
        <Route path="/artigo/:slug" component={ArtigoPage} />
        <Route path="/arquivo" component={Archive} />
        {/* Aba das mais lidas. Precisa vir ANTES do /:slug e estar em
            STATIC_PAGE_PATHS: sem isso o menu /top-news seria resolvido como
            editoria e abriria uma página de categoria vazia. */}
        <Route path="/top-news" component={TopNews} />
        {/* Possíveis transferências (destino do link do bloco da home).
            Mesmas amarras da aba acima: ANTES do /:slug e em
            STATIC_PAGE_PATHS, senão vira "editoria transferencias" vazia. */}
        <Route path="/transferencias" component={Transfers} />
        <Route path="/contato" component={Contato} />
        <Route path="/privacidade" component={Privacidade} />
        <Route path="/termos" component={Termos} />
        <Route path="/:slug"><DynamicCategory Page={CategoryPage} /></Route>
        <Route component={NotFound} />
      </Switch>
  );

  return (
    <Suspense fallback={<PageSpinner />}>
      {isAdminArea ? <AdminShell>{routes}</AdminShell> : routes}
    </Suspense>
  );
}

/* O <TooltipProvider> ficava aqui, no topo da árvore, e era o ÚNICO import
   eager de @radix-ui do site: sozinho ele colocava o vendor-radix no
   modulepreload de toda rota pública, onde nenhum tooltip existe. Passou para
   dentro do AdminShell (chunk lazy do painel) — ver PRD-PERF-02. */
function App({ ssrPath, pages }: { ssrPath?: string; pages?: SsrPages } = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter ssrPath={ssrPath} base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AnalyticsProvider />
        <ScrollToTop />
        <LangSync />
        <BrokenImageFallback />
        <SEOHead />
        <Router pages={pages} />
        <Suspense fallback={null}><LGPDConsent /></Suspense>
      </WouterRouter>
      <Suspense fallback={null}><Toaster /></Suspense>
    </QueryClientProvider>
  );
}

export default App;
