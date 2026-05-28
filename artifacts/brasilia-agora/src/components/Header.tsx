import React from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";
import logoImg from "../assets/images/logo_correio.png";

export default function Header() {
  return (
    <header className="bg-[#0d1633] py-4 border-b-4 border-[#c8102e]">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <Link href="/" className="group cursor-pointer block">
          <img
            src={logoImg}
            alt="Correio da Capital"
            className="h-16 w-auto object-contain group-hover:opacity-90 transition-opacity"
          />
        </Link>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="hidden md:flex items-center gap-2 text-white/60 text-xs">
            <span>Brasília, DF</span>
            <span>•</span>
            <span>Quarta-feira, 28 Mai 2026</span>
          </div>
          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="Buscar notícias..."
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
            />
            <button className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-white/70 hover:text-white">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
