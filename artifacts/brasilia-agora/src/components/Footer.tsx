import React from "react";
import { BRAND } from "../brand";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import logoImg from "../assets/images/logo_sbc_negativo.png";
import logoColorImg from "../assets/images/logo_brasilia_agora.png";
import { useSite } from "../hooks/useSite";

const SOCIAL = [
  { href: "#", label: "Instagram", Icon: FaInstagram },
  { href: "#", label: "Facebook",  Icon: FaFacebook  },
  { href: "#", label: "Twitter",   Icon: FaXTwitter  },
  { href: "#", label: "YouTube",   Icon: FaYoutube   },
];

const NAV_LINKS = [
  { href: "/",         label: "Início"     },
  { href: "/politica", label: "Política"   },
  { href: "/cidade",   label: "Cidade"     },
  { href: "/seguranca",label: "Segurança"  },
  { href: "/saude",    label: "Saúde"      },
  { href: "/cultura",  label: "Cultura"    },
  { href: "/esportes", label: "Esportes"   },
];

export default function Footer() {
  const { settings } = useSite();
  const style = settings?.footerStyle ?? "dark";
  const bgColor = settings?.footerBgColor;

  // ── Minimal ────────────────────────────────────────────────────────────────
  if (style === "minimal") {
    return (
      <footer className="border-t border-gray-200 py-4"
        style={{ backgroundColor: bgColor ?? "#f3f4f6" }}>
        <div className="max-w-[1280px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            {NAV_LINKS.slice(0, 5).map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-gray-800 transition-colors">{label}</Link>
            ))}
          </div>
          <div className="flex gap-2">
            {SOCIAL.map(({ href, label, Icon }) => (
              <a key={label} href={href} aria-label={label}
                className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors">
                <Icon size={13} />
              </a>
            ))}
          </div>
        </div>
      </footer>
    );
  }

  // ── Light ─────────────────────────────────────────────────────────────────
  if (style === "light") {
    return (
      <footer className="border-t-4 border-[#c8102e] pt-8 pb-5"
        style={{ backgroundColor: bgColor ?? "#f9fafb" }}>
        <div className="max-w-[1280px] mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
            <div>
              <img src={logoColorImg} alt={BRAND.name} className="h-10 w-auto object-contain mb-2" />
              <p className="text-gray-500 text-xs leading-relaxed max-w-[280px]">
                Informação com credibilidade e compromisso com a verdade sobre o Distrito Federal.
              </p>
            </div>
            <div className="flex gap-2">
              {SOCIAL.map(({ href, label, Icon }) => (
                <a key={label} href={href} aria-label={label}
                  className="w-9 h-9 bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors">
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div>
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#c8102e]">Seções</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-gray-500">
                {NAV_LINKS.map(({ href, label }) => (
                  <li key={href}><Link href={href} className="hover:text-gray-900 transition-colors">{label}</Link></li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#c8102e]">Institucional</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-gray-500">
                <li><Link href="/contato" className="hover:text-gray-900 transition-colors">Sobre nós</Link></li>
                <li><Link href="/contato" className="hover:text-gray-900 transition-colors">Fale Conosco</Link></li>
                <li><Link href="/contato" className="hover:text-gray-900 transition-colors">Anuncie</Link></li>
                <li><Link href="/privacidade" className="hover:text-gray-900 transition-colors">Privacidade</Link></li>
                <li><Link href="/termos" className="hover:text-gray-900 transition-colors">Termos de Uso</Link></li>
              </ul>
            </div>

            <div className="col-span-2">
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#c8102e]">Contato &amp; Newsletter</h3>
              <div className="text-gray-500 text-xs space-y-1 mb-4">
                <p className="text-gray-800 font-bold">(61) 99888-0000</p>
                <p>contato@sbcagora.com.br</p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-400">Receba nossas notícias</p>
              <div className="flex max-w-[320px]">
                <input type="email" placeholder="Seu e-mail"
                  className="flex-1 bg-white border border-gray-300 text-gray-800 placeholder-gray-400 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
                />
                <button className="bg-[#c8102e] text-white text-xs font-bold px-4 py-2 hover:bg-[#a00d24] transition-colors">
                  OK
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-400">
            <p>© {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.</p>
            <div className="flex gap-3">
              <Link href="/privacidade" className="hover:text-gray-700 transition-colors">Privacidade</Link>
              <span className="text-gray-300">|</span>
              <Link href="/termos" className="hover:text-gray-700 transition-colors">Termos</Link>
              <span className="text-gray-300">|</span>
              <Link href="/contato" className="hover:text-gray-700 transition-colors">Contato</Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // ── Dark (default) ────────────────────────────────────────────────────────
  return (
    <footer className="text-white pt-8 pb-5 border-t-[4px] border-[#c89110]"
      style={{ backgroundColor: bgColor ?? "#000000" }}>
      <div className="max-w-[1280px] mx-auto px-4">

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-white/10">
          <div>
            <img src={logoImg} alt={BRAND.name} className="h-10 w-auto object-contain mb-2" />
            <p className="text-gray-500 text-xs leading-relaxed max-w-[280px]">
              Informação com credibilidade e compromisso com a verdade sobre o Distrito Federal.
            </p>
          </div>
          <div className="flex gap-2">
            {SOCIAL.map(({ href, label, Icon }) => (
              <a key={label} href={href} aria-label={label}
                className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors">
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div>
            <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">Seções</h3>
            <ul className="flex flex-col gap-1.5 text-xs text-gray-400">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>

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

          <div className="col-span-2 md:col-span-2">
            <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">Contato &amp; Newsletter</h3>
            <div className="text-gray-400 text-xs space-y-1 mb-4">
              <p className="text-white font-bold">(61) 99888-0000</p>
              <p>contato@sbcagora.com.br</p>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-500">Receba nossas notícias</p>
            <div className="flex max-w-[320px]">
              <input type="email" placeholder="Seu e-mail"
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
              />
              <button className="text-black text-xs font-bold px-4 py-2 hover:bg-yellow-400 transition-colors bg-[#ffd300]">OK</button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-500">
          <p>© {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.</p>
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
