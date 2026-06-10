import React from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaTwitter, FaYoutube, FaWhatsapp } from "react-icons/fa";
import { useSite } from "../hooks/useSite";
import logoImg from "../assets/images/logo_novo.png";

export default function Header() {
  const { settings } = useSite();
  return (
    <header className="bg-[#000000] pt-[20px] pb-[20px] md:pt-[30px] md:pb-[30px] mb-[-2px]">
      <div className="max-w-[1280px] mx-auto px-4 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="group cursor-pointer block shrink-0">
          <img
            src={logoImg}
            alt={settings?.siteName ?? "Correio da Capital"}
            className="h-[48px] md:h-[72px] w-auto object-contain group-hover:opacity-90 transition-opacity"
          />
        </Link>

        {/* Redes sociais + busca */}
        <div className="flex items-center gap-3 md:gap-5 ml-auto">
          {/* Redes sociais — apenas sm+ */}
          <div className="hidden sm:flex items-center gap-3">
            <a href="https://facebook.com" target="_blank" rel="noreferrer"
              className="text-white/60 hover:text-white transition-colors" aria-label="Facebook">
              <FaFacebook size={18} />
            </a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer"
              className="text-white/60 hover:text-white transition-colors" aria-label="Instagram">
              <FaInstagram size={18} />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer"
              className="text-white/60 hover:text-white transition-colors" aria-label="Twitter / X">
              <FaTwitter size={18} />
            </a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer"
              className="text-white/60 hover:text-white transition-colors" aria-label="YouTube">
              <FaYoutube size={19} />
            </a>
            <a href="https://wa.me" target="_blank" rel="noreferrer"
              className="text-white/60 hover:text-white transition-colors" aria-label="WhatsApp">
              <FaWhatsapp size={18} />
            </a>
          </div>

          {/* Divisor */}
          <div className="hidden sm:block w-px h-5 bg-white/20" />

          {/* Busca — ícone apenas em mobile, campo em sm+ */}
          <div className="relative hidden sm:block">
            <input
              type="text"
              placeholder="Pesquisar..."
              className="w-[140px] md:w-[180px] bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-1.5 pr-8 text-[13px] rounded-sm focus:outline-none focus:border-white/50 focus:w-[200px] transition-all duration-300"
            />
            <button className="absolute right-0 top-0 bottom-0 px-2.5 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ícone de busca só no mobile */}
          <button className="sm:hidden text-white/60 hover:text-white transition-colors p-1" aria-label="Pesquisar">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
