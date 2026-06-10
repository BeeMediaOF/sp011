import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "Início", path: "/" },
  { label: "Brasil", path: "/brasil" },
  { label: "Mundo", path: "/mundo" },
  { label: "Política", path: "/politica" },
  { label: "Economia", path: "/economia" },
  { label: "Esporte", path: "/esporte" },
  { label: "Cultura", path: "/cultura" },
  { label: "Tecnologia", path: "/tecnologia" },
  { label: "Saúde", path: "/saude" },
  { label: "DF", path: "/df" },
];

const editoriaColors: Record<string, string> = {
  Início: "#c8102e",
  Brasil: "#16a34a",
  Mundo: "#6b21a8",
  Política: "#1d4ed8",
  Economia: "#b45309",
  Esporte: "#dc2626",
  Cultura: "#0d9488",
  Tecnologia: "#0284c7",
  Saúde: "#16a34a",
  DF: "#0b3d91",
};

export default function NavBar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const activeLabel = navItems.find(
    (item) => item.path === location || (item.path !== "/" && location.startsWith(item.path + "/"))
  )?.label ?? "Início";

  return (
    <>
      {/* ── Desktop nav ── */}
      <nav className="hidden md:block bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1280px] mx-auto px-4 overflow-x-auto no-scrollbar">
          <ul className="flex flex-row min-w-max">
            {navItems.map((item) => {
              const isActive = item.path === "/"
                ? location === "/"
                : location === item.path || location.startsWith(item.path + "/");
              const color = editoriaColors[item.label] || "#c8102e";
              return (
                <li key={item.label}>
                  <Link
                    href={item.path}
                    className="block text-[15px] font-bold py-3 px-4 border-b-2 transition-all whitespace-nowrap"
                    style={{
                      borderColor: isActive ? color : "transparent",
                      color: isActive ? color : "#6b7280",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = color; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ── Mobile nav bar ── */}
      <nav className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between px-4 h-12">
          <span
            className="text-[13px] font-bold uppercase tracking-widest"
            style={{ color: editoriaColors[activeLabel] || "#c8102e" }}
          >
            {activeLabel}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 text-[#1a1a1a]"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Drawer */}
        {open && (
          <div className="absolute left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50">
            <ul className="flex flex-col divide-y divide-gray-100">
              {navItems.map((item) => {
                const isActive = item.path === "/"
                  ? location === "/"
                  : location === item.path || location.startsWith(item.path + "/");
                const color = editoriaColors[item.label] || "#c8102e";
                return (
                  <li key={item.label}>
                    <Link
                      href={item.path}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-5 py-3.5 text-[15px] font-bold transition-colors"
                      style={{ color: isActive ? color : "#1a1a1a" }}
                    >
                      <span
                        className="w-1 h-5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>
    </>
  );
}
