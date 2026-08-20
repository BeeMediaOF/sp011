/**
 * Montagem do sitemap geral — a parte pura, sem banco e sem Express.
 *
 * Existe separada porque o defeito que ela corrige é de CONTEÚDO, não de
 * transporte: o endpoint funcionava e devolvia XML válido, só que anunciando 14
 * URLs fixas (12 delas de editorias de outro portal) e ZERO artigos, num blog
 * com 644 publicados. A lista de artigos vinha de um stub que devolvia `[]`
 * desde junho de 2026.
 *
 * A regra de ouro: o sitemap não pode publicar URL que redireciona, que responde
 * 404 ou que carrega `noindex`. Anunciar ao buscador uma URL que o próprio site
 * recusa é gastar rastreamento e contradizer a própria resposta.
 */

/** Limite do protocolo de sitemaps: 50.000 URLs por arquivo. */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Rotas de UM segmento que o app resolve com página própria — nunca são
 * editoria, mesmo que exista artigo com esse valor em `category`.
 * Espelha `RESERVED_PATHS` do frontend (`src/lib/categoryRoutes.ts`).
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "artigo", "arquivo", "contato", "privacidade", "termos",
]);

/** Slug de editoria aceitável numa URL: um segmento, minúsculo, sem espaço. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface SitemapArticle {
  id: string;
  slug: string | null;
  publishedAt: Date | string | null;
  /** Canonical declarado no artigo; se for de outro host, a URL fica de fora. */
  canonicalUrl: string | null;
}

export interface SitemapInput {
  /** `https://dominio` — o host da requisição, nunca um domínio embutido. */
  base: string;
  articles: readonly SitemapArticle[];
  /** Editorias COM conteúdo publicado neste blog (as vazias não entram). */
  categorySlugs: readonly string[];
}

export interface SitemapResult {
  xml: string;
  /** Quantas URLs de artigo entraram (para log e para o teste de aceite). */
  articleCount: number;
  /** Quantas ficaram de fora por passarem do limite do protocolo. */
  truncated: number;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Identificador canônico do artigo na URL: o slug; sem ele, o id.
 * Espelha `canonicalArticleSlug` do frontend — é a MESMA regra que decide o 301
 * de `/artigo/<uuid>` para `/artigo/<slug>`. Publicar o UUID aqui seria anunciar
 * uma URL que o site responde com redirect.
 */
export function canonicalArticleSlug(a: SitemapArticle): string {
  const slug = (a.slug ?? "").trim();
  return slug || (a.id ?? "").trim();
}

/** `true` quando o canonical do artigo aponta para FORA deste host. */
export function hasForeignCanonical(a: SitemapArticle, base: string): boolean {
  const raw = (a.canonicalUrl ?? "").trim();
  if (!raw) return false;
  try {
    return new URL(raw).host !== new URL(base).host;
  } catch {
    return false; // canonical inválido não é motivo para esconder a matéria
  }
}

/** Editorias publicáveis, na ordem recebida, sem reservadas nem duplicatas. */
export function indexableCategoryPaths(slugs: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = (raw ?? "").trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    if (RESERVED_SLUGS.has(slug) || !SLUG_RE.test(slug)) continue;
    seen.add(slug);
    out.push(`/${slug}`);
  }
  return out;
}

function urlTag(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodTag}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

/** `AAAA-MM-DD` de `publishedAt`; vazio quando a data não é utilizável. */
function isoDay(value: Date | string | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0] ?? "";
}

/**
 * Páginas institucionais do engine. São rotas reais e permanentes; a magreza do
 * HTML inicial delas é outro problema, e não se resolve escondendo a URL.
 */
const STATIC_PAGES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: "/arquivo",     changefreq: "weekly",  priority: "0.6" },
  { path: "/contato",     changefreq: "monthly", priority: "0.5" },
  { path: "/privacidade", changefreq: "yearly",  priority: "0.3" },
  { path: "/termos",      changefreq: "yearly",  priority: "0.3" },
];

export function buildSitemapXml(input: SitemapInput): SitemapResult {
  const base = input.base.replace(/\/+$/, "");
  const urls: string[] = [urlTag(`${base}/`, "hourly", "1.0")];

  for (const path of indexableCategoryPaths(input.categorySlugs)) {
    urls.push(urlTag(`${base}${path}`, "daily", "0.9"));
  }
  for (const p of STATIC_PAGES) {
    urls.push(urlTag(`${base}${p.path}`, p.changefreq, p.priority));
  }

  /* `lastmod` sai de `publishedAt`, e não de `updatedAt`: toda gravação de
     artigo carimba `updatedAt`, inclusive as rotinas de manutenção em lote —
     uma delas rodada num dia poria a data daquele dia em centenas de matérias,
     um sinal de frescor falso. */
  const eligible = input.articles.filter((a) => !hasForeignCanonical(a, base) && canonicalArticleSlug(a));
  const kept = eligible.slice(0, Math.max(0, SITEMAP_MAX_URLS - urls.length));

  for (const a of kept) {
    const loc = `${base}/artigo/${encodeURIComponent(canonicalArticleSlug(a))}`;
    urls.push(urlTag(loc, "monthly", "0.7", isoDay(a.publishedAt)));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return { xml, articleCount: kept.length, truncated: eligible.length - kept.length };
}
