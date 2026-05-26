import { Link, useLocation } from "wouter";

const navItems = [
  { label: "HOME", path: "/" },
  { label: "POLÍTICA", path: "/politica" },
  { label: "CIDADE", path: "/cidade" },
  { label: "SEGURANÇA", path: "/seguranca" },
  { label: "TRANSPORTE", path: "/transporte" },
  { label: "SAÚDE", path: "/saude" },
  { label: "EDUCAÇÃO", path: "/educacao" },
  { label: "CULTURA", path: "/cultura" },
  { label: "ESPORTES", path: "/esportes" },
  { label: "COLUNAS", path: "/colunas" }
];

export default function NavBar() {
  const [location] = useLocation();

  return (
    <nav className="bg-[#1a2448] border-t border-white/10 sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto px-4 overflow-x-auto">
        <ul className="flex flex-row space-x-1 min-w-max py-0">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.path);
            return (
              <li key={item.label}>
                <Link 
                  href={item.path} 
                  className={`block text-white text-sm font-bold py-3 px-3 border-b-4 hover:border-[#F5A623] hover:text-[#F5A623] transition-all whitespace-nowrap ${isActive ? 'border-[#F5A623] text-[#F5A623]' : 'border-transparent'}`}
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
