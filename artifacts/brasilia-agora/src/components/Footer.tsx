import React from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import logoImg from "../assets/images/logo_footer.png";

export default function Footer() {
  return (
    <footer className="text-white pt-10 pb-6 border-t-[4px] border-[#c8102e] bg-[#000000]">
      <div className="max-w-[1280px] mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">

        {/* Logo + Sobre */}
        <div>
          <img src={logoImg} alt="Correio da Capital" className="h-12 w-auto object-contain mb-4" />
          <p className="text-gray-500 text-sm leading-relaxed pr-4">
            Informação com credibilidade e compromisso com a verdade sobre o Distrito Federal.
          </p>
          <div className="flex gap-3 mt-4">
            <a href="#" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaInstagram size={16} />
            </a>
            <a href="#" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaFacebook size={16} />
            </a>
            <a href="#" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaXTwitter size={16} />
            </a>
            <a href="#" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaYoutube size={16} />
            </a>
          </div>
        </div>

        {/* Seções */}
        <div>
          <h3 className="font-bold mb-4 uppercase text-sm tracking-wider text-[#ffe80a]">Seções</h3>
          <ul className="flex flex-col gap-2 text-sm text-gray-400">
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Início</Link></li>
            <li><Link href="/politica" className="hover:text-white hover:pl-1 transition-all">Política</Link></li>
            <li><Link href="/cidade" className="hover:text-white hover:pl-1 transition-all">Cidade</Link></li>
            <li><Link href="/seguranca" className="hover:text-white hover:pl-1 transition-all">Segurança</Link></li>
            <li><Link href="/transporte" className="hover:text-white hover:pl-1 transition-all">Transporte</Link></li>
            <li><Link href="/saude" className="hover:text-white hover:pl-1 transition-all">Saúde</Link></li>
            <li><Link href="/educacao" className="hover:text-white hover:pl-1 transition-all">Educação</Link></li>
            <li><Link href="/cultura" className="hover:text-white hover:pl-1 transition-all">Cultura</Link></li>
            <li><Link href="/esporte" className="hover:text-white hover:pl-1 transition-all">Esporte</Link></li>
          </ul>
        </div>

        {/* Institucional */}
        <div>
          <h3 className="font-bold mb-4 uppercase text-sm tracking-wider text-[#ffe80a]">Institucional</h3>
          <ul className="flex flex-col gap-2 text-sm text-gray-400">
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Sobre o Correio</Link></li>
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Fale Conosco</Link></li>
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Anuncie</Link></li>
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Trabalhe Conosco</Link></li>
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Política de Privacidade</Link></li>
            <li><Link href="/" className="hover:text-white hover:pl-1 transition-all">Termos de Uso</Link></li>
          </ul>
        </div>

        {/* Contato + Newsletter */}
        <div>
          <h3 className="font-bold mb-4 uppercase text-sm tracking-wider text-[#ffe80a]">Contato</h3>
          <div className="text-gray-400 text-sm space-y-1.5 mb-5">
            <p className="text-white font-bold">(61) 99888-0000</p>
            <p>redacao@correiodacapital.com.br</p>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2 text-[#ffe80a]">Newsletter</p>
          <div className="flex">
            <input
              type="email"
              placeholder="Seu e-mail"
              className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
            />
            <button className="bg-[#c8102e] text-white text-xs font-bold px-3 py-2 hover:bg-red-700 transition-colors">
              OK
            </button>
          </div>
        </div>

      </div>
      <div className="max-w-[1280px] mx-auto px-4 border-t border-white/10 pt-5 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
        <p>© 2026 Correio da Capital. Todos os direitos reservados.</p>
        <div className="flex space-x-4 mt-3 md:mt-0">
          <Link href="/" className="hover:text-white transition-colors">Política de Privacidade</Link>
          <span>|</span>
          <Link href="/" className="hover:text-white transition-colors">Termos de Uso</Link>
          <span>|</span>
          <Link href="/" className="hover:text-white transition-colors">Contato</Link>
        </div>
      </div>
    </footer>
  );
}
