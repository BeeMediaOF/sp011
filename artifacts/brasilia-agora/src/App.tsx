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
import Admin from "@/pages/Admin";
import CategoryArchivePage from "@/pages/CategoryArchivePage";
import LGPDConsent from "@/components/LGPDConsent";
import SEOHead from "@/components/SEOHead";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

const CATEGORY_COLORS: Record<string, string> = {
  "#0b3d91": "#0b3d91", default: "#0b3d91",
};
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
      <Route path="/admin/login" component={Admin} />
      <Route path="/admin/:rest*" component={Admin} />
      <Route path="/admin" component={Admin} />
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
