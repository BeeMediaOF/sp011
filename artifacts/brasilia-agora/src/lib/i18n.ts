/**
 * i18n do SITE PÚBLICO (chrome: navegação, botões, avisos e datas).
 *
 * - O painel admin continua 100% pt-BR — nada aqui é usado lá.
 * - Os valores pt-BR são os literais EXATOS que existiam no código antes da
 *   extração: um blog sem `siteLanguage` configurado renderiza idêntico.
 * - Todos os formatadores de data recebem `timeZone` explícito: SSR e cliente
 *   produzem a MESMA string (corrige o risco latente de hydration mismatch
 *   para leitores fora do fuso do servidor).
 */
import { useSite } from "../hooks/useSite";

export type Lang = "pt-BR" | "en";

export const DEFAULT_TZ = "America/Sao_Paulo";

const PT = {
  // ── Busca / navegação (Header) ─────────────────────────────────────────
  "search.placeholder": "Pesquisar...",
  "search.site": "Pesquisar no site",
  "search.submit": "Buscar",
  "search.open": "Abrir busca",
  "search.close": "Fechar busca",
  "menu.open": "Abrir menu",
  "menu.close": "Fechar menu",
  "menu.nav": "Menu de navegação",
  "menu.subOpen": "Abrir submenu",
  "menu.subClose": "Fechar submenu",
  "menu.more": "Mais",

  // ── Comuns ─────────────────────────────────────────────────────────────
  "common.loading": "Carregando…",
  "common.loadingDots": "Carregando...",
  "common.seeMore": "Ver mais",
  "common.seeMoreArrow": "Ver mais →",
  "common.minRead": "min de leitura",
  "common.previous": "Anterior",
  "common.next": "Próximo",
  "common.page": "Página",
  "common.newsroom": "Redação",
  "common.home": "Início",

  // ── Home / blocos ──────────────────────────────────────────────────────
  "home.h1": "Últimas notícias de Brasília e do Distrito Federal",
  "home.latest": "Últimas",

  // ── Newsletter (rodapé + bloco da home) ────────────────────────────────
  "newsletter.thanks": "Inscrição registrada. Obrigado!",
  "newsletter.email": "Seu e-mail",
  "newsletter.emailAria": "Seu e-mail para newsletter",
  "newsletter.sending": "Enviando…",
  "newsletter.subscribe": "Assinar",
  "footer.contactNewsletter": "Contato & Newsletter",
  "footer.contact": "Contato",
  "footer.newsletter": "Newsletter",

  // ── Artigo ─────────────────────────────────────────────────────────────
  "article.share": "Compartilhe:",
  "article.shareFacebook": "Compartilhar no Facebook",
  "article.shareTwitter": "Compartilhar no Twitter/X",
  "article.shareWhatsApp": "Compartilhar no WhatsApp",
  "article.copyLink": "Copiar link",
  "article.notFound": "Artigo não encontrado",
  "article.backHome": "Voltar à página inicial",
  "article.sourceLabel": "Fonte:",
  "article.photoLabel": "Foto:",
  "article.related": "Relacionadas",
  "article.mostRead": "Mais Lidas",

  // ── Categoria ──────────────────────────────────────────────────────────
  "category.moreNews": "MAIS NOTÍCIAS",
  "category.loadMore": "CARREGAR MAIS",
  "category.mostRead": "MAIS LIDAS",
  "category.empty": "Nenhuma notícia publicada nesta categoria ainda.",
  "category.imgNone": "Sem+imagem",
  "category.imgSoon": "Em+breve",

  // ── Arquivo ────────────────────────────────────────────────────────────
  "archive.title": "Arquivo de Notícias",
  "archive.subtitle": "Todas as notícias publicadas no portal",
  "archive.searchPlaceholder": "Buscar por título ou categoria...",
  "archive.clear": "Limpar",
  "archive.all": "Todas",
  "archive.empty": "Nenhuma notícia encontrada.",
  "archive.clearFilters": "Limpar filtros",
  "archive.recent": "Mais Recentes",
  "archive.results": "Resultados",
  "archive.newsSingular": "notícia",
  "archive.newsPlural": "notícias",
  "archive.categories": "Categorias",
  "archive.byDate": "Busca por data",
  "archive.clearDate": "Limpar data",

  // ── Consentimento de cookies (pt = LGPD; en = aviso genérico) ─────────
  "consent.aria": "Controle de privacidade",
  "consent.title": "Controle sua privacidade",
  "consent.privacyPolicy": "Política de Privacidade",
  "consent.terms": "Termos de uso",
  "consent.categories": "Categorias",
  "consent.essential": "Essenciais",
  "consent.essentialDesc": "Necessários para o funcionamento do site",
  "consent.analytics": "Analytics",
  "consent.analyticsDesc": "Audiência, páginas mais lidas, tempo de tela",
  "consent.ads": "Publicidade",
  "consent.adsDesc": "Anúncios relevantes e mapa de calor",
  "consent.lockedNote": "* Não pode ser desativado",
  "consent.options": "Minhas opções",
  "consent.reject": "Rejeitar",
  "consent.accept": "Aceitar",
} as const;

export type TKey = keyof typeof PT;

const EN: Record<TKey, string> = {
  "search.placeholder": "Search...",
  "search.site": "Search the site",
  "search.submit": "Search",
  "search.open": "Open search",
  "search.close": "Close search",
  "menu.open": "Open menu",
  "menu.close": "Close menu",
  "menu.nav": "Navigation menu",
  "menu.subOpen": "Open submenu",
  "menu.subClose": "Close submenu",
  "menu.more": "More",

  "common.loading": "Loading…",
  "common.loadingDots": "Loading...",
  "common.seeMore": "See more",
  "common.seeMoreArrow": "See more →",
  "common.minRead": "min read",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.page": "Page",
  "common.newsroom": "Newsroom",
  "common.home": "Home",

  "home.h1": "Latest news",
  "home.latest": "Latest",

  "newsletter.thanks": "Subscription confirmed. Thank you!",
  "newsletter.email": "Your email",
  "newsletter.emailAria": "Your email for the newsletter",
  "newsletter.sending": "Sending…",
  "newsletter.subscribe": "Subscribe",
  "footer.contactNewsletter": "Contact & Newsletter",
  "footer.contact": "Contact",
  "footer.newsletter": "Newsletter",

  "article.share": "Share:",
  "article.shareFacebook": "Share on Facebook",
  "article.shareTwitter": "Share on Twitter/X",
  "article.shareWhatsApp": "Share on WhatsApp",
  "article.copyLink": "Copy link",
  "article.notFound": "Article not found",
  "article.backHome": "Back to home page",
  "article.sourceLabel": "Source:",
  "article.photoLabel": "Photo:",
  "article.related": "Related",
  "article.mostRead": "Most Read",

  "category.moreNews": "MORE NEWS",
  "category.loadMore": "LOAD MORE",
  "category.mostRead": "MOST READ",
  "category.empty": "No articles published in this category yet.",
  "category.imgNone": "No+image",
  "category.imgSoon": "Coming+soon",

  "archive.title": "News Archive",
  "archive.subtitle": "All articles published on this site",
  "archive.searchPlaceholder": "Search by title or category...",
  "archive.clear": "Clear",
  "archive.all": "All",
  "archive.empty": "No articles found.",
  "archive.clearFilters": "Clear filters",
  "archive.recent": "Most Recent",
  "archive.results": "Results",
  "archive.newsSingular": "article",
  "archive.newsPlural": "articles",
  "archive.categories": "Categories",
  "archive.byDate": "Search by date",
  "archive.clearDate": "Clear date",

  "consent.aria": "Privacy controls",
  "consent.title": "Your privacy choices",
  "consent.privacyPolicy": "Privacy Policy",
  "consent.terms": "Terms of Use",
  "consent.categories": "Categories",
  "consent.essential": "Essential",
  "consent.essentialDesc": "Required for the site to work",
  "consent.analytics": "Analytics",
  "consent.analyticsDesc": "Audience, most-read pages, time on page",
  "consent.ads": "Advertising",
  "consent.adsDesc": "Relevant ads and heatmaps",
  "consent.lockedNote": "* Cannot be disabled",
  "consent.options": "My choices",
  "consent.reject": "Reject",
  "consent.accept": "Accept",
};

export const DICT: Record<Lang, Record<TKey, string>> = { "pt-BR": PT, en: EN };

/**
 * Idioma síncrono a partir do cache localStorage do useSite (`bee_site_v1`),
 * para o PRIMEIRO paint não piscar pt num blog en (frio-total pisca <1s).
 */
export function resolveLang(): Lang {
  if (typeof window === "undefined") return "pt-BR";
  try {
    const raw = localStorage.getItem("bee_site_v1");
    if (raw && (JSON.parse(raw) as { siteLanguage?: string }).siteLanguage === "en") return "en";
  } catch { /* ignore */ }
  return "pt-BR";
}

function resolveTz(): string {
  if (typeof window === "undefined") return DEFAULT_TZ;
  try {
    const raw = localStorage.getItem("bee_site_v1");
    const tz = raw ? (JSON.parse(raw) as { siteTimezone?: string }).siteTimezone : undefined;
    return tz?.trim() || DEFAULT_TZ;
  } catch { return DEFAULT_TZ; }
}

/** Hook do chrome público: `const { t, lang, tz } = useT();` */
export function useT(): { t: (key: TKey) => string; lang: Lang; tz: string } {
  const { settings } = useSite();
  const lang: Lang = settings
    ? (settings.siteLanguage === "en" ? "en" : "pt-BR")
    : resolveLang();
  const tz = settings ? (settings.siteTimezone?.trim() || DEFAULT_TZ) : resolveTz();
  return { t: (key) => DICT[lang][key], lang, tz };
}

// ─── Formatadores de data (timeZone SEMPRE explícito) ────────────────────────

type DateInput = string | number | Date;

/**
 * Cache dos Intl.DateTimeFormat por (estilo, idioma, fuso).
 *
 * `date.toLocaleDateString(lang, opts)` CONSTRÓI um Intl.DateTimeFormat a cada
 * chamada, e a construção é a parte cara — formatar depois é quase de graça.
 * A home chama isto uma vez por card de cada bloco: medido em 2026-07-30,
 * 4.400 formatações (22 blocos x 200 artigos) custavam **677 ms de CPU de
 * desktop por render** — ~2,7 s no celular do PageSpeed, que roda com CPU 4x
 * mais lenta. Era a maior fatia do TBT de 2.210 ms do esporteagora. Com o
 * formatador reaproveitado as mesmas 4.400 caem para 24 ms (28x).
 *
 * A saída é byte-idêntica: `toLocaleDateString` é especificado como construir um
 * DateTimeFormat com estas mesmas opções e chamar `format`. O teste
 * `i18n.test.ts` compara as duas implementações em 4 fusos x 2 idiomas — é ele
 * que garante que a hidratação continua casando com o HTML do SSR.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatDate(
  style: string,
  d: DateInput,
  lang: Lang,
  tz: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(d);
  // Data inválida (publishedAt corrompido): Intl.format LANÇA RangeError, mas
  // toLocaleDateString devolve "Invalid Date". Mantém-se o comportamento antigo
  // — um artigo com data ruim não pode derrubar a home inteira.
  if (!Number.isFinite(date.getTime())) return date.toLocaleDateString(lang, { ...opts, timeZone: tz });
  const key = `${style}|${lang}|${tz}`;
  let fmt = dateFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lang, { ...opts, timeZone: tz });
    dateFormatters.set(key, fmt);
  }
  return fmt.format(date);
}

/** dd/mm/aaaa (pt) · m/d/yyyy (en) — substitui `toLocaleDateString("pt-BR")`. */
export function formatShortDate(d: DateInput, lang: Lang, tz: string): string {
  return formatDate("short", d, lang, tz, {});
}

/** "7 de jul." (pt) · "Jul 7" (en) — cards de seção da home/relacionadas. */
export function formatDayMonth(d: DateInput, lang: Lang, tz: string): string {
  return formatDate("dayMonth", d, lang, tz, { day: "numeric", month: "short" });
}

/** "segunda-feira, 7 de julho de 2026" — data por extenso da TopBar. */
export function formatLongDate(d: DateInput, lang: Lang, tz: string): string {
  return formatDate("long", d, lang, tz, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** "7 de julho de 2026, 14:30" — byline do artigo. */
export function formatDateTime(d: DateInput, lang: Lang, tz: string): string {
  return formatDate("dateTime", d, lang, tz, {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Tempo relativo "estilo hero" (antes duplicado em HeroSection e cia):
 * pt: "agora" · "5 min atrás" · "3 horas atrás" · "2 dias atrás".
 */
export function relativeTime(iso: DateInput, lang: Lang): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (lang === "en") {
    if (mins  <  1) return "now";
    if (mins  < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  if (mins  <  1) return "agora";
  if (mins  < 60) return `${mins} min atrás`;
  if (hours < 24) return `${hours} hora${hours > 1 ? "s" : ""} atrás`;
  return `${days} dia${days > 1 ? "s" : ""} atrás`;
}

/**
 * Tempo relativo "estilo arquivo de categoria" (curto; > 7 dias vira data):
 * pt: "agora mesmo" · "5 min atrás" · "3 h atrás" · "ontem" · "3 dias atrás".
 * Mantido separado do `relativeTime` para preservar os textos exatos de cada
 * página (unificar mudaria o HTML renderizado dos blogs pt existentes).
 */
export function relativeTimeOrDate(dateStr: DateInput, lang: Lang, tz: string): string {
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "—";
  const diff = Math.floor((Date.now() - then) / 1000);
  if (lang === "en") {
    if (diff < 60)     return "just now";
    if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 172800) return "yesterday";
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    return formatShortDate(dateStr, lang, tz);
  }
  if (diff < 60)     return "agora mesmo";
  if (diff < 3600)   return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} h atrás`;
  if (diff < 172800) return "ontem";
  if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
  return formatShortDate(dateStr, lang, tz);
}
