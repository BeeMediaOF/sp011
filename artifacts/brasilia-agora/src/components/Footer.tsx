import React from "react";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import logoImg from "../assets/images/logo_final.png";
import { FaXTwitter } from "react-icons/fa6";

export default function Footer() {
  return (
    <footer className="bg-[#1a2448] text-white pt-12 pb-6 border-t-[8px] border-[#F5A623]">
      <div className="max-w-[1280px] mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
        
        <div>
          <img
            src={logoImg}
            alt="Brasília Hoje"
            className="h-20 w-auto object-contain mb-4"
          />
          <p className="text-gray-400 text-sm leading-relaxed pr-4">
            O portal de notícias 100% focado em Brasília. Informação com credibilidade e compromisso com a verdade.
          </p>
        </div>

        <div>
          <h3 className="text-[#F5A623] font-bold mb-4 uppercase text-sm">Navegação</h3>
          <ul className="grid grid-cols-2 gap-y-2 text-sm text-gray-300">
            <li><a href="#" className="hover:text-white transition-colors">Política</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Saúde</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Cidade</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Educação</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Segurança</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Cultura</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Transporte</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Esportes</a></li>
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
          </div>
        </div>

      </div>

      <div className="max-w-[1280px] mx-auto px-4 border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
        <p>© 2024 Brasília Agora. Todos os direitos reservados.</p>
        <div className="flex space-x-4 mt-4 md:mt-0">
          <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
          <span>|</span>
          <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
          <span>|</span>
          <a href="#" className="hover:text-white transition-colors">Expediente</a>
        </div>
      </div>
    </footer>
  );
}
