import React, { useState } from "react";
import { BRAND } from "../brand";
import { Link } from "wouter";
import { FaFacebook, FaInstagram, FaYoutube, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import logoImg from "../assets/images/logo_sbc_negativo.png";
import logoColorImg from "../assets/images/logo_sbc_agora.png";
import { useSite } from "../hooks/useSite";
import {
  resolveFooterConfig, type FooterLink, type FooterSocialKey, type ResolvedFooter,
} from "../lib/footerConfig";

const SOCIAL_ICONS: Record<FooterSocialKey, React.ElementType> = {
  instagram: FaInstagram, facebook: FaFacebook, x: FaXTwitter,
  youtube: FaYoutube, tiktok: FaTiktok, whatsapp: FaWhatsapp,
};

// Link interno via wouter (SPA); externo abre em nova aba.
function FooterAnchor({ href, className, children }: {
  href: string; className?: string; children: React.ReactNode;
}) {
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
  }
  return <Link href={href || "/"} className={className}>{children}</Link>;
}

function SocialIcons({ social, className }: {
  social: ResolvedFooter["social"]; className: string;
}) {
  return (
    <div className="flex gap-2">
      {social.map(({ key, href }) => {
        const Icon = SOCIAL_ICONS[key];
        return (
          <a key={key} href={href} aria-label={key} target="_blank" rel="noopener noreferrer" className={className}>
            <Icon size={16} />
          </a>
        );
      })}
    </div>
  );
}

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("bee_session_id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("bee_session_id", id);
    }
    return id;
  } catch { return "unknown"; }
}

/** Formulário de newsletter funcional: registra a adesão via analytics. */
function NewsletterForm({ dark, accent }: { dark: boolean; accent: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    setStatus("sending");
    try {
      await fetch("/api/analytics/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "newsletter", value: v, sessionId: getSessionId() }),
      });
    } catch { /* silencioso — nunca quebra o rodapé */ }
    setStatus("ok");
    setEmail("");
  }

  if (status === "ok") {
    return <p className={`text-xs font-bold ${dark ? "text-white" : "text-gray-800"}`}>Inscrição registrada. Obrigado!</p>;
  }
  return (
    <form onSubmit={submit} className="flex max-w-[320px]">
      <input type="email" placeholder="Seu e-mail" required value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Seu e-mail para newsletter"
        className={dark
          ? "flex-1 min-w-0 bg-white/10 border border-white/20 text-white placeholder-white/40 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"
          : "flex-1 min-w-0 bg-white border border-gray-300 text-gray-800 placeholder-gray-400 px-3 py-2 text-xs focus:outline-none focus:border-[#c8102e]"} />
      <button type="submit" disabled={status === "sending"}
        className={`text-xs font-bold px-4 py-2 transition-colors disabled:opacity-60 ${dark ? "text-black hover:opacity-90" : "text-white hover:opacity-90"}`}
        style={{ backgroundColor: accent }}>
        {status === "sending" ? "…" : "OK"}
      </button>
    </form>
  );
}

function LegalRow({ links, className, sepClassName }: {
  links: FooterLink[]; className: string; sepClassName: string;
}) {
  return (
    <div className="flex gap-3 flex-wrap">
      {links.map((l, i) => (
        <React.Fragment key={l.id}>
          {i > 0 && <span className={sepClassName}>|</span>}
          <FooterAnchor href={l.href} className={className}>{l.label}</FooterAnchor>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Footer() {
  const { settings } = useSite();
  const style = settings?.footerStyle ?? "dark";
  const bgColor = settings?.footerBgColor;
  // Logo configurada no painel tem prioridade; as imagens do bundle (variante
  // negativa p/ fundo escuro, colorida p/ fundo claro) ficam só como fallback.
  const logoSrc      = settings?.logoBase64 || logoImg;
  const logoColorSrc = settings?.logoBase64 || logoColorImg;

  // Conteúdo 100% editável no painel (aba Rodapé); defaults = contato + menu.
  const f = resolveFooterConfig({
    config: settings?.footerConfig,
    contact: settings?.contact,
    menuItems: settings?.menuItems,
    siteName: settings?.siteName || BRAND.name,
    tagline: settings?.tagline,
  });

  // ── Minimal ────────────────────────────────────────────────────────────────
  if (style === "minimal") {
    const firstColumnLinks = f.columns[0]?.links.slice(0, 5) ?? [];
    return (
      <footer className="border-t border-gray-200 py-4"
        style={{ backgroundColor: bgColor ?? "#f3f4f6" }}>
        <div className="max-w-[1280px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <p>{f.copyright}</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {firstColumnLinks.map((l) => (
              <FooterAnchor key={l.id} href={l.href} className="hover:text-gray-800 transition-colors">{l.label}</FooterAnchor>
            ))}
          </div>
          {f.showSocial && (
            <SocialIcons social={f.social}
              className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors" />
          )}
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
              <img src={logoColorSrc} alt={settings?.siteName || BRAND.name} className="h-10 w-auto object-contain mb-2" />
              {f.description && (
                <p className="text-gray-600 text-xs leading-relaxed max-w-[280px]">{f.description}</p>
              )}
            </div>
            {f.showSocial && (
              <SocialIcons social={f.social}
                className="w-9 h-9 bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-[#c8102e] hover:text-white transition-colors" />
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {f.columns.map((col) => (
              <div key={col.id}>
                <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#c8102e]">{col.title}</h3>
                <ul className="flex flex-col gap-1.5 text-xs text-gray-600">
                  {col.links.map((l) => (
                    <li key={l.id}><FooterAnchor href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</FooterAnchor></li>
                  ))}
                </ul>
              </div>
            ))}

            {(f.showContact || f.showNewsletter) && (
              <div className="col-span-2">
                <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#c8102e]">
                  {f.showContact && f.showNewsletter ? "Contato & Newsletter" : f.showContact ? "Contato" : "Newsletter"}
                </h3>
                {f.showContact && (
                  <div className="text-gray-600 text-xs space-y-1 mb-4">
                    {f.phone && <p className="text-gray-800 font-bold">{f.phone}</p>}
                    {f.email && <p>{f.email}</p>}
                  </div>
                )}
                {f.showNewsletter && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-600">{f.newsletterTitle}</p>
                    <NewsletterForm dark={false} accent="#c8102e" />
                  </>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-600">
            <p>{f.copyright}</p>
            <LegalRow links={f.legalLinks} className="hover:text-gray-900 transition-colors" sepClassName="text-gray-400" />
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
            <img src={logoSrc} alt={settings?.siteName || BRAND.name} className="h-10 w-auto object-contain mb-2" />
            {f.description && (
              <p className="text-gray-400 text-xs leading-relaxed max-w-[280px]">{f.description}</p>
            )}
          </div>
          {f.showSocial && (
            <SocialIcons social={f.social}
              className="w-9 h-9 bg-white/10 flex items-center justify-center hover:bg-[#c8102e] transition-colors" />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {f.columns.map((col) => (
            <div key={col.id}>
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">{col.title}</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-gray-400">
                {col.links.map((l) => (
                  <li key={l.id}><FooterAnchor href={l.href} className="hover:text-white transition-colors">{l.label}</FooterAnchor></li>
                ))}
              </ul>
            </div>
          ))}

          {(f.showContact || f.showNewsletter) && (
            <div className="col-span-2 md:col-span-2">
              <h3 className="font-bold mb-3 uppercase text-xs tracking-wider text-[#ffd300]">
                {f.showContact && f.showNewsletter ? "Contato & Newsletter" : f.showContact ? "Contato" : "Newsletter"}
              </h3>
              {f.showContact && (
                <div className="text-gray-400 text-xs space-y-1 mb-4">
                  {f.phone && <p className="text-white font-bold">{f.phone}</p>}
                  {f.email && <p>{f.email}</p>}
                </div>
              )}
              {f.showNewsletter && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-gray-400">{f.newsletterTitle}</p>
                  <NewsletterForm dark accent="#ffd300" />
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-gray-400">
          <p>{f.copyright}</p>
          <LegalRow links={f.legalLinks} className="hover:text-white transition-colors" sepClassName="text-gray-700" />
        </div>

      </div>
    </footer>
  );
}
