import { Switch, Route, Router as WouterRouter } from "wouter";
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
import LGPDConsent from "@/components/LGPDConsent";
import { useAnalytics } from "@/hooks/useAnalytics";

const queryClient = new QueryClient();

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
          <Router />
          <LGPDConsent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
