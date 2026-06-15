import React from "react";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import logoImg from "../assets/images/logo_sbc_negativo.png";

export default function Footer() {
  return (
    <footer className="text-white pt-8 pb-5 border-t-[4px] border-[#c89110] bg-[#000000]">
      <div className="max-w-[1280px] mx-auto px-4">

        {/* Linha superior: Logo + Redes sociais (mobile: empilhado) */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-white/10">
          <div>
            <img src={logoImg} alt="Bee News" className="h-10 w-auto object-contain mb-2 ml-[1px] pl-[33px] pr-[46px] pt-[-3px] pb-[-8px]" />
            <p className="text-gray-500 text-xs leading-relaxed max-w-[280px]">
              Informação com credibilidade e compromisso com a verdade sobre o Distrito Federal.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="#" aria-label="Instagram" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaInstagram size={16} />
            </a>
            <a href="#" aria-label="Facebook" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaFacebook size={16} />
            </a>
            <a href="#" aria-label="X / Twitter" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaXTwitter size={16} />
            </a>
            <a href="#" aria-label="YouTube" className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
              <FaYoutube size={16} />
            </a>
          </div>
        </div>

        {/* Links + Contato: 2 colunas no mobile, 4 no desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">

          {/* Seções */}
          <div>
            <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">Seções</h3>
            <ul className="flex flex-col gap-1.5 text-xs text-gray-400">
              <li><Link href="/" className="hover:text-white transition-colors">Início</Link></li>
              <li><Link href="/politica" className="hover:text-white transition-colors">Política</Link></li>
              <li><Link href="/cidade" className="hover:text-white transition-colors">Cidade</Link></li>
              <li><Link href="/seguranca" className="hover:text-white transition-colors">Segurança</Link></li>
              <li><Link href="/transporte" className="hover:text-white transition-colors">Transporte</Link></li>
              <li><Link href="/saude" className="hover:text-white transition-colors">Saúde</Link></li>
              <li><Link href="/educacao" className="hover:text-white transition-colors">Educação</Link></li>
              <li><Link href="/cultura" className="hover:text-white transition-colors">Cultura</Link></li>
              <li><Link href="/esportes" className="hover:text-white transition-colors">Esportes</Link></li>
              <li><Link href="/arquivo" className="hover:text-white transition-colors">Arquivo</Link></li>
            </ul>
          </div>

          {/* Institucional */}
          <div>
            <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">Institucional</h3>
            <ul className="flex flex-col gap-1.5 text-xs text-gray-400">
              <li><Link href="/contato" className="hover:text-white transition-colors">Sobre nós</Link></li>
              <li><Link href="/contato" className="hover:text-white transition-colors">Fale Conosco</Link></li>
              <li><Link href="/contato" className="hover:text-white transition-colors">Anuncie</Link></li>
              <li><Link href="/contato" className="hover:text-white transition-colors">Trabalhe Conosco</Link></li>
              <li><Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link></li>
              <li><Link href="/termos" className="hover:text-white transition-colors">Termos de Uso</Link></li>
            </ul>
          </div>

          {/* Contato — span 2 colunas no mobile p/ ficar na linha de baixo com newsletter */}
          <div className="col-span-2 md:col-span-2">
            <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">Contato &amp; Newsletter</h3>
            <div className="text-gray-400 text-xs space-y-1 mb-4">
              <p className="text-white font-bold">(61) 99888-0000</p>
              <p>contato@beenews.ai</p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-500">Receba nossas notícias</p>
            <div className="flex max-w-[320px]">
              <input
                type="email"
                placeholder="Seu e-mail"
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
              />
              <button className="text-black text-xs font-bold px-4 py-2 hover:bg-yellow-400 transition-colors bg-[#ffd300]">
                OK
              </button>
            </div>
          </div>

        </div>

        {/* Rodapé inferior */}
        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-500">
          <p>© 2026 BeeNews.AI. Todos os direitos reservados.</p>
          <div className="flex gap-3">
            <Link href="/privacidade" className="hover:text-white transition-colors">Privacidade</Link>
            <span className="text-gray-700">|</span>
            <Link href="/termos" className="hover:text-white transition-colors">Termos</Link>
            <span className="text-gray-700">|</span>
            <Link href="/contato" className="hover:text-white transition-colors">Contato</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
