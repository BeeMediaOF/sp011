import { Link, Route, Switch, useLocation } from "wouter";
import { getToken, setToken, api } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Blogs from "./pages/Blogs";
import Rules from "./pages/Rules";
import Sources from "./pages/Sources";
import News from "./pages/News";
import Review from "./pages/Review";
import Deliveries from "./pages/Deliveries";
import Settings from "./pages/Settings";
import Usage from "./pages/Usage";
import Logs from "./pages/Logs";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/blogs", label: "Blogs" },
  { href: "/regras", label: "Regras" },
  { href: "/fontes", label: "Fontes RSS" },
  { href: "/noticias", label: "Notícias" },
  { href: "/revisao", label: "Revisão" },
  { href: "/entregas", label: "Entregas" },
  { href: "/consumo", label: "Consumo IA" },
  { href: "/logs", label: "Logs" },
  { href: "/configuracoes", label: "Configurações" },
];

export default function App() {
  const [location, navigate] = useLocation();

  if (!getToken()) {
    return <Login onLogin={() => navigate("/")} />;
  }

  const logout = () => {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    navigate("/login");
    location; // touch p/ re-render
    window.location.href = "/";
  };

  return (
    <div className="layout">
      <nav className="sidebar">
        <h1>📡 Painel Central</h1>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className={location === item.href ? "active" : ""}>
            {item.label}
          </Link>
        ))}
        <div className="spacer" />
        <a href="#sair" onClick={(e) => { e.preventDefault(); logout(); }}>Sair</a>
      </nav>
      <main className="content">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/blogs" component={Blogs} />
          <Route path="/regras" component={Rules} />
          <Route path="/fontes" component={Sources} />
          <Route path="/noticias" component={News} />
          <Route path="/revisao" component={Review} />
          <Route path="/entregas" component={Deliveries} />
          <Route path="/consumo" component={Usage} />
          <Route path="/logs" component={Logs} />
          <Route path="/configuracoes" component={Settings} />
          <Route>Página não encontrada.</Route>
        </Switch>
      </main>
    </div>
  );
}
