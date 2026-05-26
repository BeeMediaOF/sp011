import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Menu, Image, Settings, LogOut,
  ChevronLeft, ChevronRight, Globe, Newspaper, Webhook,
} from "lucide-react";

const NAV = [
  { label: "Dashboard",  icon: LayoutDashboard, path: "/admin" },
  { label: "Artigos",    icon: FileText,         path: "/admin/artigos" },
  { label: "Novo Artigo",icon: Newspaper,        path: "/admin/artigos/novo" },
  { label: "Menu",       icon: Menu,             path: "/admin/menu" },
  { label: "Logo",       icon: Image,            path: "/admin/logo" },
  { label: "Webhook",    icon: Webhook,          path: "/admin/webhook" },
  { label: "Config.",    icon: Settings,         path: "/admin/configuracoes" },
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
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-[#1a2448] text-white transition-all duration-300 ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
          {!collapsed && (
            <span className="text-sm font-bold tracking-wide text-[#F5A623] uppercase">Brasília Hoje</span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-white/70 hover:text-white transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ label, icon: Icon, path }) => {
            const active = path === "/admin" ? location === "/admin" : location.startsWith(path) && path !== "/admin";
            return (
              <Link key={path} href={path}>
                <a
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors cursor-pointer
                    ${active ? "bg-[#F5A623] text-[#1a2448] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
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

      {/* Main content */}
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
