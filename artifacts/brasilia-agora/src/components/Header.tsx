import React from "react";
import { Search, Menu } from "lucide-react";
import { Link } from "wouter";
import logoImg from "../assets/images/logo_correio.png";

export default function Header() {
  return (
    <header className="bg-white py-5 border-b border-gray-200">
      <div className="max-w-[1280px] mx-auto px-4 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="group cursor-pointer block shrink-0">
          <img
            src={logoImg}
            alt="Correio da Capital"
            className="h-24 w-auto object-contain group-hover:opacity-90 transition-opacity"
          />
        </Link>

        {/* Busca + Ações */}
        <div className="flex items-center gap-3 w-full max-w-xl">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar notícias..."
              className="w-full bg-gray-100 border border-gray-300 text-[#1a1a1a] placeholder-gray-500 px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#c8102e] focus:ring-1 focus:ring-[#c8102e]"
            />
            <button className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-gray-500 hover:text-[#c8102e]">
              <Search className="w-4 h-4" />
            </button>
          </div>
          <button className="hidden md:flex items-center gap-2 text-gray-600 hover:text-[#1a1a1a] transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <button className="bg-[#0b3d91] text-white text-[13px] font-bold px-5 py-2.5 hover:bg-[#0a2e6d] transition-colors uppercase tracking-wider">
            Assine
          </button>
        </div>

      </div>
    </header>
  );
}
