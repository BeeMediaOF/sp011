/**
 * RSS Processor — shared logic used by both the route handler and the scheduler.
 * Handles scraping, AI rewrite, and auto-import of articles.
 */

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { store, type RssSource, type RssAutoMode } from "./store.js";
import { logger } from "./logger.js";

// ─── RSS parser ───────────────────────────────────────────────────────────────

export const rssParser = new Parser({
  timeout: 10_000,
  headers: { "User-Agent": "SBC-Agora-RSS-Bot/1.0" },
  customFields: {
    item: [
      ["media:content",   "media:content",   { keepArray: false }],
      ["media:thumbnail", "media:thumbnail", { keepArray: false }],
    ],
  },
});

// ─── Tag mapping ──────────────────────────────────────────────────────────────

export const TAG_MAP: Record<string, string> = {
  politica: "POLÍTICA", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", geral: "GERAL",
};

// ─── SEO / AIO journalist prompt ──────────────────────────────────────────────

export const DEFAULT_PROMPT_TEMPLATE = `Você é um jornalista sênior especialista em SEO e AIO (AI Overview) para portais de notícias brasileiros.

Reescreva o artigo abaixo seguindo RIGOROSAMENTE estas diretrizes:

**ESTRUTURA JORNALÍSTICA:**
1. Primeiro parágrafo: responda às perguntas Quem, O quê, Quando, Onde e Por quê (pirâmide invertida)
2. Desenvolvimento: detalhe os fatos em ordem decrescente de importância
3. Use intertítulos com ## para seções principais (H2) e ### para subseções (H3) — obrigatório quando houver 3+ parágrafos sobre o mesmo tema
4. Use listas com marcadores (-) para enumerações ou sequências de dados

**SEO (ranqueamento em buscadores):**
- Insira o tema central naturalmente no primeiro parágrafo
- Varie os termos relacionados ao longo do texto (sinônimos, contexto)
- Parágrafos curtos (máx. 3-4 frases)
- Linguagem clara e acessível ao público geral

**AIO (para ser citado por respostas de IA como ChatGPT e Google):**
- Responda perguntas de forma explícita no texto (ex: "O que é X? Trata-se de...")
- Seja factual e completo — não omita dados relevantes do original
- Inclua todos os dados do texto original: números, datas, nomes, locais, percentuais

**REGRAS ABSOLUTAS:**
- NUNCA invente informações — use apenas os dados do texto original
- NÃO inclua o título no corpo do texto
- NÃO adicione notas, explicações ou comentários fora do artigo
- Português brasileiro formal, mas acessível
{{CREDITO}}

**METADADOS SEO (sempre ao final, exatamente neste formato):**
SLUG: [slug-seo-do-artigo-em-kebab-case-sem-acentos-max-60-chars]
KEYWORDS: [palavra1, palavra2, palavra3, palavra4, palavra5, palavra6]

Título original: {{TITULO}}

Texto original a reescrever:
{{TEXTO}}`;

export function applyPromptTemplate(
  template: string, title: string, text: string, sourceName: string, giveCredit: boolean
): string {
  const creditLine = giveCredit
    ? `- PENÚLTIMA LINHA OBRIGATÓRIA antes dos metadados: "Com informações de: ${sourceName}"`
    : "";
  return template
    .replace(/\{\{TITULO\}\}/g, title)
    .replace(/\{\{TEXTO\}\}/g, text.slice(0, 7000))
    .replace(/\{\{FONTE\}\}/g, sourceName)
    .replace(/\{\{CREDITO\}\}/g, creditLine);
}

export function buildPrompt(
  title: string, text: string, sourceName: string, giveCredit: boolean
): string {
  return applyPromptTemplate(DEFAULT_PROMPT_TEMPLATE, title, text, sourceName, giveCredit);
}

/**
 * Resolve the best prompt for a source following the hierarchy:
 * source.customPrompt > category prompt > global prompt > DEFAULT_PROMPT_TEMPLATE
 */
export function resolvePrompt(
  source: { customPrompt?: string; category: string },
  prompts?: { global?: string; categories?: Record<string, string> }
): string {
  if (source.customPrompt) return source.customPrompt;
  if (prompts?.categories?.[source.category]) return prompts.categories[source.category]!;
  if (prompts?.global) return prompts.global;
  return DEFAULT_PROMPT_TEMPLATE;
}

// ─── AI rewrite ───────────────────────────────────────────────────────────────

function getGeminiFree() {
  const baseURL = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"] ?? "dummy";
  if (!baseURL) throw new Error("AI_INTEGRATIONS_GEMINI_BASE_URL não configurada");
  return new GoogleGenAI({ apiKey, httpOptions: { baseUrl: baseURL } });
}

export interface RewriteResult {
  content: string;
  keywords: string;
  slug: string;
}

function parseRewriteResult(raw: string): RewriteResult {
  const slugMatch    = raw.match(/^SLUG:\s*(.+)$/m);
  const keywordsMatch = raw.match(/^KEYWORDS:\s*(.+)$/m);
  const slug     = (slugMatch?.[1] ?? "").trim().replace(/^\[|\]$/g, "").slice(0, 80);
  const keywords = (keywordsMatch?.[1] ?? "").trim().replace(/^\[|\]$/g, "");
  const content  = raw
    .replace(/^SLUG:\s*.+$/m, "")
    .replace(/^KEYWORDS:\s*.+$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content, keywords, slug };
}

export async function rewriteWithAI(
  title: string, text: string, sourceName: string, giveCredit: boolean, customPrompt?: string
): Promise<RewriteResult> {
  const settings = store.getSettings();
  const provider = settings.rssAiProvider ?? "gemini_free";
  const prompt   = customPrompt
    ? applyPromptTemplate(customPrompt, title, text, sourceName, giveCredit)
    : buildPrompt(title, text, sourceName, giveCredit);

  let raw = "";

  if (provider === "openai") {
    const apiKey = settings.rssAiApiKey;
    if (!apiKey) throw new Error("API key da OpenAI não configurada");
    const model = settings.rssAiModel || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8192,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI: ${err?.error?.message ?? res.statusText}`);
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = data.choices?.[0]?.message?.content ?? "";
  } else if (provider === "gemini_paid") {
    const apiKey = settings.rssAiApiKey;
    if (!apiKey) throw new Error("API key do Gemini não configurada");
    const model = settings.rssAiModel || "gemini-2.5-flash";
    const ai = new GoogleGenAI({ apiKey });
    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });
    raw = resp.text ?? "";
  } else {
    // Default: gemini_free (Replit integration)
    const ai    = getGeminiFree();
    const model = settings.rssAiModel || "gemini-2.5-flash";
    const resp  = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });
    raw = resp.text ?? "";
  }

  return parseRewriteResult(raw);
}

// ─── Scraping ─────────────────────────────────────────────────────────────────

/** Fetch article URL and extract og:image + full text body */
export async function scrapeArticle(url: string): Promise<{ text: string; imageUrl: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0; +https://sbcagora.com.br)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { text: "", imageUrl: "" };
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Featured image — prefer og:image over anything else
    const imageUrl =
      $("meta[property='og:image']").attr("content") ??
      $("meta[name='twitter:image']").attr("content") ??
      $("meta[property='og:image:secure_url']").attr("content") ??
      $("meta[name='thumbnail']").attr("content") ??
      "";

    // 2. Remove noise — structural elements + common Brazilian news site widgets
    $([
      "script","style","nav","header","footer","aside",
      ".ad",".advertisement",".sidebar",".menu",".popup",
      "[class*='cookie']","[class*='banner']","[id*='cookie']",
      "figure figcaption","noscript",
      // Agência Brasil / EBC specific
      ".destaques-ebc",".radio-agencia",".tv-brasil",
      ".relacionadas",".related",".related-news",
      ".mais-noticias",".mais-lidas",".mais-conteudo",
      ".ver-mais",".leia-mais",".read-more",
      ".tags-list",".tags",".article-tags",
      ".compartilhe",".share",".social-share",
      ".newsletter",".newsletter-box",
      ".breadcrumb",".breadcrumbs",
      // G1, UOL, Folha
      ".gpt-ad",".gam-ad","[id*='gpt']","[id*='taboola']",
      ".paywall",".subscription",".premium-content",
      ".edicao",".edition-bar",
      ".article-footer",".post-footer",
      "[class*='recommend']","[class*='sugest']","[class*='widget']",
    ].join(",")).remove();

    // 3. Article body selectors (priority order)
    const bodySelectors = [
      "[itemprop='articleBody']",
      ".article-body", ".article-content", ".article-text",
      ".post-content", ".entry-content",
      ".materia-conteudo", ".noticia-texto", ".texto-noticia",
      ".content-article", ".content-body",
      "article .content", "article .body", "article",
      ".main-content main", "main",
    ];

    /** Extract paragraphs from an element, preserving structure */
    function extractParagraphs(el: ReturnType<typeof $>): string {
      const paras: string[] = [];
      el.find("p, h2, h3, h4, li").each((_i, node) => {
        const tag  = (node as { tagName?: string }).tagName?.toLowerCase() ?? "p";
        const t    = $(node).text().replace(/\s+/g, " ").trim();
        if (t.length < 20) return;
        if (tag === "h2" || tag === "h3" || tag === "h4") {
          paras.push(`## ${t}`);
        } else if (tag === "li") {
          paras.push(`- ${t}`);
        } else {
          paras.push(t);
        }
      });
      return paras.join("\n\n");
    }

    let text = "";
    for (const sel of bodySelectors) {
      const el = $(sel);
      if (el.length && el.text().trim().length > 250) {
        const structured = extractParagraphs(el);
        text = structured.length > 100 ? structured : el.text().replace(/\s+/g, " ").trim();
        break;
      }
    }

    // 4. Fallback: gather all <p> text preserving paragraph breaks
    if (!text) {
      text = $("p")
        .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 50)
        .join("\n\n");
    }

    // 5. Post-processing: truncate at common "end of article" sentinels
    //    (inline navigation/widgets that DOM removal didn't catch)
    const SENTINELS = [
      /\bRelacionadas?\b/,
      /\bVer mais\b/i,
      /\bMais not[ií]cias?\b/i,
      /\bDestaques EBC\b/i,
      /\bRadioagência\b/i,
      /\bTV Brasil\b/i,
      /\bCompartilhe essa not[ií]cia\b/i,
      /\bContinuar lendo\b/i,
      /\bLeia (também|mais)\b/i,
      /\bEdi[çc][aã]o:\s/i,
      /\bPublicidade\b/i,
      /\bNewsletter\b/i,
      /^Tags?:/im,
    ];
    for (const sentinel of SENTINELS) {
      const match = sentinel.exec(text);
      if (match && match.index > 200) {
        text = text.slice(0, match.index).trim();
        break;
      }
    }

    // 6. Strip leading metadata noise (category header, title echo, byline, date)
    //    Pattern: lines before the first real sentence of the article
    text = text
      // Remove "Publicado em dd/mm/yyyy - hh:mm Cidade Versão em áudio"
      .replace(/Publicado em \d{2}\/\d{2}\/\d{4}[^.]*?(Versão em áudio\s*)?/gi, "")
      // Remove standalone city names at start ("São Paulo", "Brasília", etc.)
      .replace(/^(São Paulo|Brasília|Rio de Janeiro|Belo Horizonte|Curitiba|Salvador|Fortaleza)\s+/i, "")
      // Remove ">> Siga o canal..." CTAs
      .replace(/>>?\s*Siga .{0,80}/gi, "")
      // Collapse multiple spaces
      .replace(/\s{2,}/g, " ")
      .trim();

    return { text: text.slice(0, 8000), imageUrl };
  } catch {
    return { text: "", imageUrl: "" };
  }
}

/** Extract image directly from RSS item fields (fallback if page not scraped) */
export function extractRssImage(item: Parser.Item): string {
  type IE = Parser.Item & {
    "media:content"?: { $?: { url?: string }; url?: string };
    "media:thumbnail"?: { $?: { url?: string }; url?: string };
    enclosure?: { url?: string };
  };
  const it = item as IE;
  if (it["media:content"]?.$?.url) return it["media:content"]!.$!.url!;
  if (it["media:content"]?.url)     return it["media:content"]!.url!;
  if (it["media:thumbnail"]?.$?.url) return it["media:thumbnail"]!.$!.url!;
  if (it.enclosure?.url)            return it.enclosure.url;
  const html = item["content:encoded"] ?? item.content ?? item.summary ?? "";
  if (html) {
    const $ = cheerio.load(html);
    const src = $("img[src]").filter((_i, el) => {
      const s = $(el).attr("src") ?? "";
      return !s.includes("logo") && !s.includes("icon") && !s.includes("pixel");
    }).first().attr("src");
    if (src) return src;
  }
  return "";
}

/** Strip HTML tags and normalise whitespace */
export function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// ─── Fetch + process one source ───────────────────────────────────────────────

export interface FetchedArticle {
  sourceId: string; sourceName: string; category: string;
  title: string; link: string; pubDate: string;
  imageUrl: string; excerpt: string; fullText: string;
}

/** Scrape a news site homepage, extract article links and their content */
async function scrapeNewsHomepage(src: RssSource): Promise<FetchedArticle[]> {
  const res = await fetch(src.url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0; +https://sbcagora.com.br)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar ${src.url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Determine base origin for resolving relative URLs
  const baseOrigin = new URL(src.url).origin;

  // Collect candidate article links — prioritise structured elements
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
      // Must be same domain
      try { if (new URL(href).origin !== baseOrigin) return; } catch { return; }
      // Skip taxonomy / utility pages
      if (/\/(tag|tags|categoria|category|author|autor|busca|search|page|pagina|wp-content|cdn-cgi)\//i.test(href)) return;
      // Skip anchor-only fragments
      if (/#/.test(href) && href.split("#")[0] === src.url) return;
      // Must look like an article (has a meaningful path)
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

  const toScrape = links.slice(0, 3);

  const results: FetchedArticle[] = [];
  await Promise.allSettled(toScrape.map(async (link) => {
    try {
      const artRes = await fetch(link, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0; +https://sbcagora.com.br)" },
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

      const { text, imageUrl } = await scrapeArticle(link);

      // Detect category from meta or URL path
      const metaCat =
        $a("meta[property='article:section']").attr("content") ??
        $a("meta[name='section']").attr("content") ??
        $a(".breadcrumb li").eq(1).text().trim() ??
        "";
      const urlParts = new URL(link).pathname.split("/").filter(Boolean);
      const rawCat = metaCat || (urlParts.length > 1 ? urlParts[0]! : "") || src.category;
      const category = src.category; // default to source category; raw used as hint
      void rawCat; // acknowledged but source category is the authoritative assignment

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
        sourceId: src.id, sourceName: src.name, category,
        title, link,
        pubDate: new Date().toISOString(),
        imageUrl: finalImage,
        excerpt,
        fullText: text || excerpt,
      });
    } catch {
      // skip failed articles silently
    }
  }));

  return results;
}

export async function fetchSourceArticles(src: RssSource): Promise<FetchedArticle[]> {
  let feed: Awaited<ReturnType<typeof rssParser.parseURL>>;
  try {
    feed = await rssParser.parseURL(src.url);
  } catch {
    // RSS/Atom parsing failed — fall back to HTML web scraping
    return scrapeNewsHomepage(src);
  }
  const items = feed.items.slice(0, 3); // max 3 por rodada

  const results: FetchedArticle[] = [];
  await Promise.allSettled(items.map(async (item) => {
    const link    = item.link ?? "";
    const rawHtml = item["content:encoded"] ?? item.content ?? item.summary ?? "";
    const excerpt = stripHtml(rawHtml).slice(0, 300);

    // Always scrape article page for og:image + full text
    const scraped  = link ? await scrapeArticle(link) : { text: "", imageUrl: "" };
    const imageUrl = scraped.imageUrl || extractRssImage(item);
    const fullText = scraped.text || (rawHtml.length > 500 ? stripHtml(rawHtml) : excerpt);

    results.push({
      sourceId: src.id, sourceName: src.name, category: src.category,
      title:     item.title ?? "Sem título",
      link,
      pubDate:   item.pubDate ?? item.isoDate ?? new Date().toISOString(),
      imageUrl,
      excerpt,
      fullText: fullText || excerpt,
    });
  }));

  return results;
}

/** Auto-process a fetched article based on source autoMode */
export async function autoProcessArticle(
  art: FetchedArticle, src: RssSource
): Promise<void> {
  const { autoMode, giveCredit, name: sourceName, category } = src;
  if (autoMode === "none") return;

  // Skip duplicates — check by title or source URL
  if (store.isDuplicateArticle(art.title, art.link)) {
    logger.info({ title: art.title }, "Skipping duplicate RSS article");
    return;
  }

  let content         = art.fullText;
  let keywords        = "";
  let slug            = "";
  let aiRewriteSuccess = false;
  let author          = giveCredit ? `Redação (via ${sourceName})` : "Redação";

  if (autoMode === "rewrite_draft" || autoMode === "rewrite_publish") {
    try {
      const prompts = store.getRssPrompts();
      const chosenPrompt = resolvePrompt(src, prompts);
      const result = await rewriteWithAI(art.title, art.fullText, sourceName, giveCredit, chosenPrompt);
      content          = result.content;
      keywords         = result.keywords;
      slug             = result.slug;
      aiRewriteSuccess = true;
    } catch (err) {
      logger.warn({ err, sourceId: src.id }, "AI rewrite failed — using original text");
    }
  }

  const status = (autoMode === "publish" || autoMode === "rewrite_publish")
    ? "published" : "draft";

  store.createArticle({
    title:         art.title,
    subtitle:      art.excerpt.slice(0, 160),
    content,
    category,
    tag:           TAG_MAP[category] ?? "GERAL",
    imageUrl:      art.imageUrl,
    author,
    publishedAt:   new Date().toISOString(),
    status,
    origin:        "rss",
    rssSourceId:   art.sourceId,
    rssSourceName: art.sourceName,
    rssSourceUrl:  art.link,
    aiRewritten:   aiRewriteSuccess,
    keywords:      keywords || undefined,
    slug:          slug || undefined,
  });
}

/** Full pipeline: fetch source, process each article */
const MAX_PER_ROUND = 3;

export async function processDueSource(src: RssSource): Promise<number> {
  const articles = await fetchSourceArticles(src); // already capped at 3 by fetchSourceArticles
  let processed = 0;
  for (const art of articles) {
    if (processed >= MAX_PER_ROUND) break;
    if (store.isDuplicateArticle(art.title, art.link)) {
      logger.info({ title: art.title }, "Skipping duplicate RSS article in scheduler");
      continue;
    }
    try {
      await autoProcessArticle(art, src);
      processed++;
    } catch (err) {
      logger.warn({ err, articleTitle: art.title }, "Error processing article");
    }
  }
  store.updateRssSource(src.id, { lastFetchedAt: new Date().toISOString() });
  return processed;
}
