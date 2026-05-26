import React from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";
import logoImg from "../assets/images/logo_transparent.png";

export default function Header() {
  return (
    <header className="bg-[#1a2448] py-6">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
        <Link href="/" className="group cursor-pointer block">
          <img
            src={logoImg}
            alt="Brasília Hoje"
            className="h-16 w-auto object-contain group-hover:opacity-90 transition-opacity"
          />
        </Link>
        
        <div className="w-full md:w-auto">
          <div className="relative relative w-full md:w-80">
            <input 
              type="text" 
              placeholder="Buscar notícias..." 
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/60 px-4 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
            />
            <button className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-white/80 hover:text-white">
              <Search className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
