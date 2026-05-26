import React from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";

export default function Header() {
  return (
    <header className="bg-[#1a2448] py-6">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
        <Link href="/" className="flex flex-col group cursor-pointer">
          <div className="flex items-end">
            <h1 className="text-4xl font-extrabold text-white tracking-tighter mr-2 group-hover:opacity-90 transition-opacity">
              BRASÍLIA <span className="text-[#F5A623]">AGORA</span>
            </h1>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-blue-400 mb-1">
              <path d="M12 2C12 2 8 8 8 12C8 16 12 22 12 22C12 22 16 16 16 12C16 8 12 2 12 2ZM11 22V12C11 10.5 11.5 9 12 8C12.5 9 13 10.5 13 12V22H11Z" />
              <path d="M4 14C4 14 6 12 8 12V22H4V14ZM20 14C20 14 18 12 16 12V22H20V14Z" />
            </svg>
          </div>
          <p className="text-white text-xs tracking-widest mt-1 opacity-80 font-medium">A NOTÍCIA QUE MOVE A CAPITAL</p>
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
