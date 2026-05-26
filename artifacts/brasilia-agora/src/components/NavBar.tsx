import React from "react";

const navItems = [
  "POLÍTICA",
  "CIDADE",
  "SEGURANÇA",
  "TRANSPORTE",
  "SAÚDE",
  "EDUCAÇÃO",
  "CULTURA",
  "ESPORTES",
  "COLUNAS"
];

export default function NavBar() {
  return (
    <nav className="bg-[#1a2448] border-t border-white/10 sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto px-4 overflow-x-auto">
        <ul className="flex flex-row space-x-1 min-w-max py-0">
          {navItems.map((item) => (
            <li key={item}>
              <a 
                href="#" 
                className="block text-white text-sm font-bold py-3 px-3 border-b-4 border-transparent hover:border-[#F5A623] hover:text-[#F5A623] transition-all whitespace-nowrap"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
