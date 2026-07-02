/**
 * Configuração editável do rodapé (settings.footerConfig).
 *
 * O rodapé sempre renderiza a partir de resolveFooterConfig(): a config salva
 * no painel tem prioridade; o que não foi customizado cai nos defaults atuais
 * (colunas Seções/Institucional, contato do hub de Contato, copyright do site).
 * Assim, sites existentes sem footerConfig continuam idênticos.
 */

export interface FooterLink {
  id: string;
  label: string;
  href: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

/** Chaves de redes sociais suportadas (ícones mapeados no Footer). */
export type FooterSocialKey = "instagram" | "facebook" | "x" | "youtube" | "tiktok" | "whatsapp";

export type FooterSocial = Partial<Record<FooterSocialKey, string>>;

export interface FooterConfig {
  /** Texto descritivo abaixo da logo. */
  description?: string;
  showSocial?: boolean;
  /** URLs das redes. Vazio/ausente → cai no hub de Contato. */
  social?: FooterSocial;
  /** Colunas de links. Ausente → colunas padrão (Seções do menu + Institucional). */
  columns?: FooterColumn[];
  showContact?: boolean;
  phone?: string;
  email?: string;
  showNewsletter?: boolean;
  newsletterTitle?: string;
  /** Suporta {year} e {site}. */
  copyright?: string;
  /** Linha final (Privacidade | Termos | Contato). */
  legalLinks?: FooterLink[];
}

/** Subconjunto público do hub de Contato exposto em /api/site. */
export interface PublicContact {
  displayEmail?: string;
  phone?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  tiktok?: string;
  address?: string;
  cnpj?: string;
}

export interface ResolvedFooterSocial {
  key: FooterSocialKey;
  href: string;
}

export interface ResolvedFooter {
  description: string;
  showSocial: boolean;
  social: ResolvedFooterSocial[];
  columns: FooterColumn[];
  showContact: boolean;
  phone: string;
  email: string;
  showNewsletter: boolean;
  newsletterTitle: string;
  copyright: string;
  legalLinks: FooterLink[];
}

export const DEFAULT_INSTITUTIONAL_LINKS: FooterLink[] = [
  { id: "sobre",       label: "Sobre nós",     href: "/contato" },
  { id: "fale",        label: "Fale Conosco",  href: "/contato" },
  { id: "anuncie",     label: "Anuncie",       href: "/contato" },
  { id: "privacidade", label: "Privacidade",   href: "/privacidade" },
  { id: "termos",      label: "Termos de Uso", href: "/termos" },
];

export const DEFAULT_LEGAL_LINKS: FooterLink[] = [
  { id: "privacidade", label: "Privacidade", href: "/privacidade" },
  { id: "termos",      label: "Termos",      href: "/termos" },
  { id: "contato",     label: "Contato",     href: "/contato" },
];

const SOCIAL_KEYS: FooterSocialKey[] = ["instagram", "facebook", "x", "youtube", "tiktok", "whatsapp"];

/** Normaliza URL de rede social: aceita "@user"/"user" e completa com https. */
export function normalizeSocialUrl(key: FooterSocialKey, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (key) {
    case "instagram": return `https://instagram.com/${handle}`;
    case "facebook":  return `https://facebook.com/${handle}`;
    case "x":         return `https://x.com/${handle}`;
    case "youtube":   return `https://youtube.com/@${handle}`;
    case "tiktok":    return `https://tiktok.com/@${handle}`;
    case "whatsapp":  return `https://wa.me/${handle.replace(/\D/g, "")}`;
  }
}

export function renderCopyright(template: string, siteName: string): string {
  return template
    .replace(/\{year\}/g, String(new Date().getFullYear()))
    .replace(/\{site\}/g, siteName);
}

export function resolveFooterConfig(opts: {
  config?: FooterConfig | null;
  contact?: PublicContact | null;
  menuItems?: { label: string; path: string }[] | null;
  siteName?: string;
  tagline?: string;
}): ResolvedFooter {
  const cfg = opts.config ?? {};
  const contact = opts.contact ?? {};
  const siteName = opts.siteName ?? "";

  // Redes: config do rodapé tem prioridade; senão, hub de Contato.
  const socialSource: FooterSocial = { ...contact, ...(cfg.social ?? {}) };
  const social: ResolvedFooterSocial[] = SOCIAL_KEYS
    .map((key) => ({ key, href: normalizeSocialUrl(key, socialSource[key] ?? "") }))
    .filter((s) => s.href !== "");

  // Colunas: default = Seções (menu visível) + Institucional.
  const menuLinks: FooterLink[] = (opts.menuItems ?? [])
    .slice(0, 8)
    .map((m, i) => ({ id: `menu-${i}`, label: m.label, href: m.path }));
  const defaultColumns: FooterColumn[] = [
    { id: "secoes", title: "Seções", links: menuLinks },
    { id: "institucional", title: "Institucional", links: DEFAULT_INSTITUTIONAL_LINKS },
  ];

  return {
    description: cfg.description
      ?? opts.tagline
      ?? "Informação com credibilidade e compromisso com a verdade.",
    showSocial: cfg.showSocial ?? true,
    social,
    columns: (cfg.columns && cfg.columns.length > 0 ? cfg.columns : defaultColumns)
      .filter((c) => c.links.length > 0 || c.title.trim() !== ""),
    showContact: cfg.showContact ?? true,
    phone: cfg.phone ?? contact.phone ?? "",
    email: cfg.email ?? contact.displayEmail ?? "",
    showNewsletter: cfg.showNewsletter ?? true,
    newsletterTitle: cfg.newsletterTitle ?? "Receba nossas notícias",
    copyright: renderCopyright(
      cfg.copyright ?? "© {year} {site}. Todos os direitos reservados.",
      siteName,
    ),
    legalLinks: cfg.legalLinks ?? DEFAULT_LEGAL_LINKS,
  };
}
