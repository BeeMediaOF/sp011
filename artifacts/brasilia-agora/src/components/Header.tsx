import React from "react";
import { Search } from "lucide-react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaTwitter, FaYoutube, FaWhatsapp } from "react-icons/fa";
import { useSite } from "../hooks/useSite";
import logoImg from "../assets/images/logo_novo.png";

export default function Header() {
  const { settings } = useSite();
  return (
    <header className="py-4 border-b border-white/10 bg-[#000000] border-l-[0px]">
      <div className="max-w-[1280px] mx-auto px-4 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="group cursor-pointer block shrink-0">
          <img
            src={logoImg}
            alt={settings?.siteName ?? "Correio da Capital"}
            className="h-[72px] w-auto object-contain group-hover:opacity-90 transition-opacity ml-[0px] mr-[0px] border-t-[0px] border-r-[0px] border-b-[0px] border-l-[0px] rounded-tl-[0px] rounded-tr-[0px] rounded-br-[0px] rounded-bl-[0px]"
          />
        </Link>

        {/* Redes sociais + busca */}
        <div className="flex items-center gap-5 ml-auto">
          {/* Redes sociais */}
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

          {/* Busca compacta */}
          <div className="relative">
            <input
              type="text"
              placeholder="Pesquisar..."
              className="w-[180px] bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-1.5 pr-8 text-[13px] rounded-sm focus:outline-none focus:border-white/50 focus:w-[240px] transition-all duration-300"
            />
            <button className="absolute right-0 top-0 bottom-0 px-2.5 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
