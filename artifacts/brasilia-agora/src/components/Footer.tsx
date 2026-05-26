import React from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import logoImg from "../assets/images/logo_v2.png";

export default function Footer() {
  return (
    <footer className="bg-[#1a2448] text-white pt-12 pb-6 border-t-[8px] border-[#F5A623]">
      <div className="max-w-[1280px] mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

        <div>
          <img src={logoImg} alt="Brasília Hoje" className="h-32 w-auto object-contain mb-4" />
          <p className="text-gray-400 text-sm leading-relaxed pr-4">
            O portal de notícias 100% focado em Brasília. Informação com credibilidade e compromisso com a verdade.
          </p>
        </div>

        <div>
          <h3 className="text-[#F5A623] font-bold mb-4 uppercase text-sm">Navegação</h3>
          <ul className="grid grid-cols-2 gap-y-2 text-sm text-gray-300">
            <li><Link href="/politica" className="hover:text-white transition-colors">Política</Link></li>
            <li><Link href="/saude" className="hover:text-white transition-colors">Saúde</Link></li>
            <li><Link href="/cidade" className="hover:text-white transition-colors">Cidade</Link></li>
            <li><Link href="/educacao" className="hover:text-white transition-colors">Educação</Link></li>
            <li><Link href="/seguranca" className="hover:text-white transition-colors">Segurança</Link></li>
            <li><Link href="/cultura" className="hover:text-white transition-colors">Cultura</Link></li>
            <li><Link href="/transporte" className="hover:text-white transition-colors">Transporte</Link></li>
            <li><Link href="/esportes" className="hover:text-white transition-colors">Esportes</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-[#F5A623] font-bold mb-4 uppercase text-sm">Siga Nossas Redes</h3>
          <div className="flex space-x-4">
            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#F5A623] hover:text-[#1a2448] transition-colors"><FaInstagram size={18} /></a>
            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#F5A623] hover:text-[#1a2448] transition-colors"><FaFacebook size={18} /></a>
            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#F5A623] hover:text-[#1a2448] transition-colors"><FaXTwitter size={18} /></a>
            <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-[#F5A623] hover:text-[#1a2448] transition-colors"><FaYoutube size={18} /></a>
          </div>
        </div>

        <div>
          <h3 className="text-[#F5A623] font-bold mb-4 uppercase text-sm">Contato</h3>
          <div className="text-gray-300 text-sm space-y-2">
            <p>redacao@brasiliaagora.com.br</p>
            <p className="font-bold text-white text-lg">(61) 99888-0000</p>
            <p className="text-xs text-gray-400">suporte@beemedia.ai</p>
          </div>
        </div>

      </div>

      <div className="max-w-[1280px] mx-auto px-4 border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
        <p>© 2024 Brasília Agora. Todos os direitos reservados.</p>
        <div className="flex space-x-4 mt-4 md:mt-0">
          <Link href="/" className="hover:text-white transition-colors">Política de Privacidade</Link>
          <span>|</span>
          <Link href="/" className="hover:text-white transition-colors">Termos de Uso</Link>
          <span>|</span>
          <Link href="/contato" className="hover:text-white transition-colors">Contato</Link>
          <span>|</span>
          <Link href="/arquivo" className="hover:text-white transition-colors">Arquivo</Link>
        </div>
      </div>
    </footer>
  );
}
