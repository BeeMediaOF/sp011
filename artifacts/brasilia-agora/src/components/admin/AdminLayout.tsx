import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Image, Settings, LogOut,
  ChevronLeft, ChevronRight, Globe, Newspaper, Webhook, Megaphone,
  Users, Mail, BarChart2, LayoutGrid,
} from "lucide-react";
import logoImg from "../../assets/images/logo_sbc_negativo.png";

const NAV = [
  { label: "Dashboard",    icon: LayoutDashboard, path: "/admin" },
  { label: "Analytics",    icon: BarChart2,        path: "/admin/analytics" },
  { label: "Artigos",      icon: FileText,         path: "/admin/artigos" },
  { label: "Novo Artigo",  icon: Newspaper,        path: "/admin/artigos/novo" },
  { label: "Menu",         icon: Menu,             path: "/admin/menu" },
  { label: "Blocos Home",  icon: LayoutGrid,       path: "/admin/home-blocos" },
  { label: "Propagandas",  icon: Megaphone,        path: "/admin/propagandas" },
  { label: "Colunistas",   icon: Users,            path: "/admin/colunistas" },
  { label: "Logo",         icon: Image,            path: "/admin/logo" },
  { label: "Contato",      icon: Mail,             path: "/admin/contato" },
  { label: "Webhook",      icon: Webhook,          path: "/admin/webhook" },
  { label: "Config.",      icon: Settings,         path: "/admin/configuracoes" },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location, navigate] = useLocation();

  function handleLogout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <aside
        className={`flex flex-col bg-[#1a2448] text-white transition-all duration-300 ${collapsed ? "w-16" : "w-60"}`}
      >
        <div className="flex items-center justify-between px-3 py-4 border-b border-white/10">
          {!collapsed && (
            <img
              src={logoImg}
              alt="SBC Agora"
              className="h-9 w-auto object-contain"
            />
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/70 hover:text-white transition-colors ml-auto shrink-0"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ label, icon: Icon, path }) => {
            const active = path === "/admin" ? location === "/admin" : location.startsWith(path) && path !== "/admin";
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors cursor-pointer
                  ${active ? "bg-[#F5A623] text-[#1a2448] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-2 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm transition-colors"
          >
            <Globe size={18} className="shrink-0" />
            {!collapsed && <span>Ver site</span>}
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-white/60 hover:text-red-400 hover:bg-white/10 text-sm transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          <span className="text-xs text-gray-400">Painel Administrativo</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
