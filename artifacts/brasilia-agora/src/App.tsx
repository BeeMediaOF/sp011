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
import Artigo from "@/pages/Artigo";
import Archive from "@/pages/Archive";
import Contato from "@/pages/Contato";
import Admin from "@/pages/Admin";

const queryClient = new QueryClient();

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
      <Route path="/artigo/:slug" component={Artigo} />
      <Route path="/arquivo" component={Archive} />
      <Route path="/contato" component={Contato} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SideAds() {
  return (
    <>
      <a
        href="https://www.toyota.com.br/modelos/rav4"
        target="_blank"
        rel="noreferrer"
        className="hidden 2xl:block fixed left-4 top-1/2 -translate-y-1/2 z-40 w-[160px] shadow-lg hover:opacity-90 transition-opacity"
      >
        <img src="/ad-toyota-rav4.jpg" alt="Toyota RAV4 — A vida é uma aventura" className="w-full h-auto" />
      </a>
      <a
        href="https://www.toyota.com.br/modelos/rav4"
        target="_blank"
        rel="noreferrer"
        className="hidden 2xl:block fixed right-4 top-1/2 -translate-y-1/2 z-40 w-[160px] shadow-lg hover:opacity-90 transition-opacity"
      >
        <img src="/ad-toyota-rav4.jpg" alt="Toyota RAV4 — A vida é uma aventura" className="w-full h-auto" />
      </a>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <SideAds />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
