/**
 * Coleta RSS + fallback de scraping de homepage — cópia de
 * `api-server/src/lib/rssProcessor.ts`. Adaptações: tipo `EngineSource`
 * próprio, limite default por parâmetro (sem store) e captura do `guid`
 * do item RSS (âncora de dedup do painel central).
 */
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { DEFAULT_USER_AGENT, scrapeArticle, extractRssImage, stripHtml } from "./scrape.ts";
import type { EngineSource, FetchedArticle } from "./types.ts";

export const rssParser = new Parser({
  timeout: 10_000,
  headers: { "User-Agent": "NewsHub-RSS-Bot/1.0" },
  customFields: {
    item: [
      ["media:content", "media:content", { keepArray: false }],
      ["media:thumbnail", "media:thumbnail", { keepArray: false }],
    ],
  },
});

// ─── Mapeamento de tags ───────────────────────────────────────────────────────

export const TAG_MAP: Record<string, string> = {
  politica: "POLÍTICA", mundo: "MUNDO", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", geral: "GERAL",
};

/** Padrão de artigos por fonte quando nem a fonte nem o chamador definem limite. */
export const DEFAULT_FETCH_LIMIT = 3;

export interface FetchOptions {
  /** Limite default global (equivalente ao `collectionDefaultFetchLimit` do blog). */
  defaultFetchLimit?: number;
  userAgent?: string;
  /**
   * Dedup ANTES do scrape, com os campos que o próprio feed já traz (título/
   * guid/link — custo zero). Quando presente, o fetchLimit passa a valer para
   * itens NOVOS: a varredura avança pelo feed (até scanLimit) pulando os já
   * conhecidos. Sem ele, fonte com fetchLimit baixo fica presa nos itens do
   * topo já coletados e rende zero em feed de ritmo lento.
   */
  isKnown?: (probe: FeedProbe) => Promise<boolean>;
  /** Profundidade da varredura atrás de itens novos (default: fetchLimit; teto 50). */
  scanLimit?: number;
}

/** Sonda de dedup pré-scrape: só campos disponíveis antes de baixar a página. */
export interface FeedProbe {
  title?: string;
  guid?: string;
  url?: string;
}

/**
 * Seleciona até `limit` itens novos entre os `scanLimit` primeiros, na ordem
 * do feed, pulando os que `isKnown` reconhecer. Sem `isKnown`, degrada para o
 * corte clássico `slice(0, limit)` (comportamento histórico).
 */
export async function pickFreshItems<T>(
  items: T[],
  limit: number,
  probe: (item: T) => FeedProbe,
  opts?: Pick<FetchOptions, "isKnown" | "scanLimit">,
): Promise<T[]> {
  const isKnown = opts?.isKnown;
  if (!isKnown) return items.slice(0, limit);
  const scan = Math.max(limit, Math.min(Math.floor(opts?.scanLimit ?? limit) || limit, 50));
  const fresh: T[] = [];
  for (const item of items.slice(0, scan)) {
    if (fresh.length >= limit) break;
    const p = probe(item);
    // Sem título, guid nem link não há como deduplicar — nem vale um scrape.
    if (!p.title && !p.guid && !p.url) continue;
    if (await isKnown(p)) continue;
    fresh.push(item);
  }
  return fresh;
}

/** Limite de artigos por rodada desta fonte: fonte > default do chamador > padrão (3). */
export function sourceFetchLimit(src: EngineSource, defaultFetchLimit?: number): number {
  const n = src.fetchLimit ?? defaultFetchLimit ?? DEFAULT_FETCH_LIMIT;
  return Math.max(1, Math.min(Math.floor(n) || DEFAULT_FETCH_LIMIT, 20));
}

/**
 * Higieniza título vindo do feed: alguns veículos anexam o próprio crédito no
 * título ("... - @BBCSportTopStories") e ele vazava para o título reescrito e
 * para a arte social. Conservador de propósito: só remove sufixo de @handle —
 * títulos legítimos com hífen ficam intactos.
 */
export function cleanFeedTitle(title: string): string {
  return title
    .replace(/(?:\s*[-–—|:]?\s*@[\w.]+)+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raspa a homepage de um portal, extraindo links de artigos e seus conteúdos. */
async function scrapeNewsHomepage(src: EngineSource, opts?: FetchOptions): Promise<FetchedArticle[]> {
  const userAgent = opts?.userAgent ?? DEFAULT_USER_AGENT;
  const res = await fetch(src.url, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar ${src.url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const baseOrigin = new URL(src.url).origin;

  const seen = new Set<string>();
  const links: string[] = [];

  const selectors = [
    "article a[href]", ".post a[href]", ".noticia a[href]",
    ".news-item a[href]", ".lista-noticias a[href]", ".card a[href]",
    "h2 a[href]", "h3 a[href]", ".headline a[href]", ".titulo a[href]",
    "main a[href]", "section a[href]",
  ];

  for (const sel of selectors) {
    $(sel).each((_i, el) => {
      if (links.length >= 12) return false as unknown as void;
      let href = $(el).attr("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("javascript") || href.startsWith("mailto")) return;
      if (!href.startsWith("http")) href = new URL(href, baseOrigin).href;
      try { if (new URL(href).origin !== baseOrigin) return; } catch { return; }
      if (/\/(tag|tags|categoria|category|author|autor|busca|search|page|pagina|wp-content|cdn-cgi)\//i.test(href)) return;
      if (/#/.test(href) && href.split("#")[0] === src.url) return;
      const path = new URL(href).pathname;
      if (path === "/" || path === "" || path.split("/").filter(Boolean).length < 1) return;
      if (seen.has(href)) return;
      seen.add(href);
      links.push(href);
    });
    if (links.length >= 9) break;
  }

  if (links.length === 0) {
    throw new Error("Nenhum link de artigo encontrado na página. Verifique se a URL aponta para um portal de notícias.");
  }

  const toScrape = await pickFreshItems(
    links,
    sourceFetchLimit(src, opts?.defaultFetchLimit),
    (link) => ({ url: link }),
    opts,
  );

  const results: FetchedArticle[] = [];
  await Promise.allSettled(toScrape.map(async (link) => {
    try {
      const artRes = await fetch(link, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(12_000),
      });
      if (!artRes.ok) return;
      const artHtml = await artRes.text();
      const $a = cheerio.load(artHtml);

      const title = (
        $a("meta[property='og:title']").attr("content") ??
        $a("meta[name='twitter:title']").attr("content") ??
        $a("h1").first().text().trim() ??
        ""
      ).replace(/\s+/g, " ").trim();

      if (!title || title.length < 5) return;

      const { text, imageUrl } = await scrapeArticle(link, userAgent);

      const excerpt = (
        $a("meta[property='og:description']").attr("content") ??
        $a("meta[name='description']").attr("content") ??
        text.slice(0, 300)
      ).slice(0, 300);

      const finalImage =
        imageUrl ||
        ($a("meta[property='og:image']").attr("content") ??
          $a("meta[name='twitter:image']").attr("content") ??
          "");

      results.push({
        sourceId: src.id, sourceName: src.name, category: src.category,
        title, link,
        guid: link,
        pubDate: new Date().toISOString(),
        imageUrl: finalImage,
        excerpt,
        fullText: text || excerpt,
      });
    } catch {
      // artigos com falha são pulados silenciosamente
    }
  }));

  return results;
}

/** Coleta uma fonte: parse RSS com fallback para scraping da homepage. */
export async function fetchSourceArticles(src: EngineSource, opts?: FetchOptions): Promise<FetchedArticle[]> {
  let feed: Awaited<ReturnType<typeof rssParser.parseURL>>;
  try {
    feed = await rssParser.parseURL(src.url);
  } catch {
    // Parse RSS/Atom falhou — cai para scraping HTML da homepage
    return scrapeNewsHomepage(src, opts);
  }
  const items = await pickFreshItems(
    feed.items,
    sourceFetchLimit(src, opts?.defaultFetchLimit),
    (item) => ({
      title: item.title ? cleanFeedTitle(item.title) || undefined : undefined,
      guid: item.guid ?? (item as { id?: string }).id ?? undefined,
      url: item.link || undefined,
    }),
    opts,
  );
  const userAgent = opts?.userAgent ?? DEFAULT_USER_AGENT;

  const results: FetchedArticle[] = [];
  await Promise.allSettled(items.map(async (item) => {
    const link = item.link ?? "";
    const rawHtml = (item as { "content:encoded"?: string })["content:encoded"] ?? item.content ?? item.summary ?? "";
    const excerpt = stripHtml(rawHtml).slice(0, 300);

    // Sempre raspa a página do artigo para og:image + texto completo
    const scraped = link ? await scrapeArticle(link, userAgent) : { text: "", imageUrl: "" };
    const imageUrl = scraped.imageUrl || extractRssImage(item);
    const fullText = scraped.text || (rawHtml.length > 500 ? stripHtml(rawHtml) : excerpt);

    results.push({
      sourceId: src.id, sourceName: src.name, category: src.category,
      title: item.title ? cleanFeedTitle(item.title) || "Sem título" : "Sem título",
      link,
      guid: item.guid ?? (item as { id?: string }).id ?? undefined,
      pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
      imageUrl,
      excerpt,
      fullText: fullText || excerpt,
    });
  }));

  return results;
}
