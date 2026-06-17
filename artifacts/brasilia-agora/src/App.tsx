import { Switch, Route, Router as WouterRouter, useParams } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Politica from "@/pages/Politica";
import Cidade from "@/pages/Cidade";
import Seguranca from "@/pages/Seguranca";
import Transporte from "@/pages/Transporte";
import Saude from "@/pages/Saude";
import Educacao from "@/pages/Educacao";
import Cultura from "@/pages/Cultura";
import Esportes from "@/pages/Esportes";
import Colunas from "@/pages/Colunas";
import Brasil from "@/pages/Brasil";
import Mundo from "@/pages/Mundo";
import Economia from "@/pages/Economia";
import Tecnologia from "@/pages/Tecnologia";
import Artigo from "@/pages/Artigo";
import Archive from "@/pages/Archive";
import Contato from "@/pages/Contato";
import Privacidade from "@/pages/Privacidade";
import Termos from "@/pages/Termos";
import CategoryArchivePage from "@/pages/CategoryArchivePage";
import LGPDConsent from "@/components/LGPDConsent";
import SEOHead from "@/components/SEOHead";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useState, useEffect } from "react";

// Admin pages
import { RequireAuth } from "@/pages/Admin";
import Login from "@/pages/admin/Login";
import Dashboard from "@/pages/admin/Dashboard";
import Articles from "@/pages/admin/Articles";
import ArticleEdit from "@/pages/admin/ArticleEdit";
import MenuManager from "@/pages/admin/MenuManager";
import LogoUpload from "@/pages/admin/LogoUpload";
import Settings from "@/pages/admin/Settings";
import Webhook from "@/pages/admin/Webhook";
import AdsManager from "@/pages/admin/AdsManager";
import ColumnistsManager from "@/pages/admin/ColumnistsManager";
import ContactSettings from "@/pages/admin/ContactSettings";
import Analytics from "@/pages/admin/Analytics";
import HomeBlocksManager from "@/pages/admin/HomeBlocksManager";
import RSSManager from "@/pages/admin/RSSManager";
import SocialMedia from "@/pages/admin/SocialMedia";
import PerplexitySearch from "@/pages/admin/PerplexitySearch";

const queryClient = new QueryClient();

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
    <Switch>
      {/* ── Admin routes (flattened — avoids Wouter v3 nested-Switch issues) ── */}
      <Route path="/admin/login" component={Login} />
      <Route path="/admin/artigos/novo">
        <RequireAuth><ArticleEdit /></RequireAuth>
      </Route>
      <Route path="/admin/artigos/:id">
        <RequireAuth><ArticleEdit /></RequireAuth>
      </Route>
      <Route path="/admin/artigos">
        <RequireAuth><Articles /></RequireAuth>
      </Route>
      <Route path="/admin/menu">
        <RequireAuth><MenuManager /></RequireAuth>
      </Route>
      <Route path="/admin/logo">
        <RequireAuth><LogoUpload /></RequireAuth>
      </Route>
      <Route path="/admin/configuracoes">
        <RequireAuth><Settings /></RequireAuth>
      </Route>
      <Route path="/admin/webhook">
        <RequireAuth><Webhook /></RequireAuth>
      </Route>
      <Route path="/admin/propagandas">
        <RequireAuth><AdsManager /></RequireAuth>
      </Route>
      <Route path="/admin/colunistas">
        <RequireAuth><ColumnistsManager /></RequireAuth>
      </Route>
      <Route path="/admin/contato">
        <RequireAuth><ContactSettings /></RequireAuth>
      </Route>
      <Route path="/admin/analytics">
        <RequireAuth><Analytics /></RequireAuth>
      </Route>
      <Route path="/admin/home-blocos">
        <RequireAuth><HomeBlocksManager /></RequireAuth>
      </Route>
      <Route path="/admin/rss">
        <RequireAuth><RSSManager /></RequireAuth>
      </Route>
      <Route path="/admin/redes-sociais">
        <RequireAuth><SocialMedia /></RequireAuth>
      </Route>
      <Route path="/admin/perplexity">
        <RequireAuth><PerplexitySearch /></RequireAuth>
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
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AnalyticsProvider />
          <SEOHead />
          <Router />
          <LGPDConsent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
