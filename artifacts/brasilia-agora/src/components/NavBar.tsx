import { Link, useLocation } from "wouter";

const navItems = [
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

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-[1280px] mx-auto px-4 overflow-x-auto">
        <ul className="flex flex-row min-w-max">
          <li>
            <Link
              href="/"
              className={`block text-[16px] font-bold py-3 px-4 border-b-2 transition-all whitespace-nowrap ${
                location === "/" ? "border-[#c8102e] text-[#1a1a1a]" : "border-transparent text-gray-600 hover:text-[#1a1a1a]"
              }`}
            >
              Início
            </Link>
          </li>
          {navItems.map((item) => {
            const isActive = location === item.path || location.startsWith(item.path + "/");
            const color = editoriaColors[item.label] || "#c8102e";
            return (
              <li key={item.label}>
                <Link
                  href={item.path}
                  className="block text-[16px] font-bold py-3 px-4 border-b-2 transition-all whitespace-nowrap"
                  style={{
                    borderColor: isActive ? color : "transparent",
                    color: isActive ? color : "#6b7280",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = color;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.target as HTMLElement).style.color = "#6b7280";
                    }
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
