import { useEffect, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import {
  LayoutDashboard, Globe, SlidersHorizontal, Rss, FileText, ClipboardCheck,
  Send, BarChart2, ScrollText, Settings as SettingsIcon, LogOut, Moon, Sun, Radio,
} from "lucide-react";
import { getToken, setToken, api } from "./api";
import { getStoredUser, clearStoredUser } from "./user";
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
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/blogs", label: "Blogs", icon: Globe },
  { href: "/regras", label: "Regras", icon: SlidersHorizontal },
  { href: "/fontes", label: "Fontes RSS", icon: Rss },
  { href: "/noticias", label: "Notícias", icon: FileText },
  { href: "/revisao", label: "Revisão", icon: ClipboardCheck },
  { href: "/entregas", label: "Entregas", icon: Send },
  { href: "/consumo", label: "Consumo IA", icon: BarChart2 },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon },
];

// Modo escuro persistido — mesmo comportamento do painel do blog (toggle no topbar).
const DARK_KEY = "central_dark";

function getDark(): boolean {
  try { return localStorage.getItem(DARK_KEY) === "1"; } catch { return false; }
}

function formatDate() {
  return new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export default function App() {
  const [location, navigate] = useLocation();
  const [dark, setDark] = useState(getDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem(DARK_KEY, dark ? "1" : "0"); } catch { /* ignore */ }
  }, [dark]);

  if (!getToken()) {
    return <Login onLogin={() => navigate("/")} />;
  }

  const logout = () => {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setToken(null);
    clearStoredUser();
    window.location.href = "/";
  };

  const user = getStoredUser();
  const name = user?.name || "Administrador";
  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "AD";
  const title = NAV.find((i) => i.href === location)?.label ?? "Painel Central";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo"><Radio size={20} /> Painel Central</div>
          <p className="sb-tagline">Coleta, reescrita e distribuição</p>
        </div>

        <nav className="sb-nav">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${location === href ? "active" : ""}`}>
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="sb-footer">
          <button type="button" className="nav-item logout" onClick={logout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="tb-right">
            <span className="tb-date">📅 {formatDate()}</span>
            <button
              type="button"
              className="icon-btn"
              title={dark ? "Modo claro" : "Modo escuro"}
              onClick={() => setDark((d) => !d)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="user-chip">
              <span className="avatar">{initials}</span>
              <span className="u-meta">
                <span className="u-name">{name}</span>
                <span className="u-role">Administrador</span>
              </span>
            </div>
          </div>
        </header>

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
    </div>
  );
}
