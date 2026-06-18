/**
 * RSS Processor — shared logic used by both the route handler and the scheduler.
 * Handles scraping, AI rewrite, and auto-import of articles.
 */

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { store, type RssSource, type RssAutoMode } from "./store.js";
import { logger } from "./logger.js";

// ─── Event log ────────────────────────────────────────────────────────────────

export interface RssLogEntry {
  id: string;
  ts: string;
  type: "fetch" | "rewrite" | "publish" | "draft" | "skip" | "error" | "duplicate";
  sourceName: string;
  articleTitle: string;
  message?: string;
}

const MAX_LOG = 300;
const _rssEventLog: RssLogEntry[] = [];

function addLog(entry: Omit<RssLogEntry, "id" | "ts">) {
  _rssEventLog.unshift({
    id: Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
    ...entry,
  });
  if (_rssEventLog.length > MAX_LOG) _rssEventLog.pop();
}

export function getRssLog(): RssLogEntry[] { return [..._rssEventLog]; }

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
  politica: "POLÍTICA", mundo: "MUNDO", cidade: "CIDADE", seguranca: "SEGURANÇA",
  transporte: "TRANSPORTE", saude: "SAÚDE", educacao: "EDUCAÇÃO",
  cultura: "CULTURA", esportes: "ESPORTES", economia: "ECONOMIA",
  tecnologia: "TECNOLOGIA", geral: "GERAL",
};

// ─── SEO / AIO journalist prompt ──────────────────────────────────────────────

export const DEFAULT_PROMPT_TEMPLATE = `Você é um jornalista sênior especialista em SEO, Google Discover e jornalismo digital para portais de notícias brasileiros.

Com base na pauta e no conteúdo abaixo, produza uma matéria jornalística original em Português do Brasil.

Título / Pauta: {{TITULO}}
Fonte: {{FONTE}}
{{CREDITO}}

Conteúdo da fonte:
{{TEXTO}}

## INSTRUÇÕES

**TÍTULO:** Elabore um título de cauda longa de cerca de 150 caracteres, altamente chamativo, otimizado para SEO de entidades e para o Google Discover. Cite o assunto principal e entidades importantes. NÃO repita o título dentro do content_html.

**SUBTÍTULO:** Crie um subtítulo de cerca de 150 caracteres que complemente o título e introduza o texto, ele será o primeiro <h2> dentro do content_html.

**CONTEÚDO (content_html):**
- Comece com o subtítulo como primeiro <h2> dentro do content_html
- Após o H2, escreva uma lead com 3 parágrafos curtos introduzindo o assunto e fazendo um gancho para o que o leitor irá encontrar
- Cite a fonte ao final da lead: por exemplo, "conforme informação divulgada por {{FONTE}}"
- Use até 4 subtítulos <h3> para organizar o restante do texto
- Parágrafos curtos: 150 a 250 caracteres cada — faça muitos parágrafos curtos
- Use <b> para negritos em palavras e frases importantes, NUNCA use ** ou outras marcações markdown
- Prefira texto corrido; use <ul><li> apenas quando necessário para a didática do conteúdo
- NUNCA coloque <h1> dentro do content_html
- NUNCA use travessões (—), use sempre vírgula
- NUNCA escreva códigos de idioma como "pt-BR", "en-US" ou similares em nenhuma parte da resposta
- Distribua a palavra-chave principal (extraída do título) ao longo do texto
- Linguagem clara, acessível e fácil de entender pelo público brasileiro
- Somente use informações presentes no conteúdo da fonte, nunca invente dados

**METADADOS:**
- slug: kebab-case sem acentos, máximo 60 caracteres
- keywords: 6 palavras-chave relevantes separadas por vírgula

## REGRAS ABSOLUTAS
- Retorne EXCLUSIVAMENTE JSON válido, sem markdown, sem \`\`\`json, sem explicações antes ou depois
- O content_html deve conter HTML pronto para WordPress (<h2>, <h3>, <p>, <b>, <em>, <ul>, <li>), sem <html>, <body> ou <script>
- O subtítulo <h2> deve estar DENTRO do content_html
- Comece o título e o subtítulo diretamente com o conteúdo, sem prefixos

## RESPOSTA (apenas JSON, direto, sem delimitadores de código):
{
  "title": "...",
  "subtitle": "...",
  "content_html": "<h2>...</h2><p>...</p>...",
  "slug": "titulo-seo-kebab-case",
  "keywords": "palavra1, palavra2, palavra3, palavra4, palavra5, palavra6"
}`;

export function applyPromptTemplate(
  template: string, title: string, text: string, sourceName: string, giveCredit: boolean
): string {
  const creditLine = giveCredit
    ? `- Ao final da lead/introdução, cite obrigatoriamente a fonte com a frase: "conforme informação divulgada por ${sourceName}".`
    : `- Não é necessário citar a fonte original no texto.`;
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
  title?: string;
  subtitle?: string;
}

function parseRewriteResult(raw: string): RewriteResult {
  // Strip markdown code fences if the model wraps output in ```json ... ```
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Try to parse as JSON (new format)
  try {
    const parsed = JSON.parse(stripped) as {
      title?: string; subtitle?: string;
      content_html?: string; slug?: string; keywords?: string;
    };
    const content  = (parsed.content_html ?? "").trim();
    const keywords = (parsed.keywords ?? "").trim();
    const slug     = (parsed.slug ?? "").trim().slice(0, 80);
    const title    = (parsed.title ?? "").trim();
    const subtitle = (parsed.subtitle ?? "").trim();
    return { content, keywords, slug, title, subtitle };
  } catch {
    // Fallback: old plain-text format with SLUG:/KEYWORDS: markers
    const slugMatch     = raw.match(/^SLUG:\s*(.+)$/m);
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
}

/** Retry helper — retries on 503/UNAVAILABLE up to maxAttempts times */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 5_000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const isRetryable =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded") ||
        msg.includes("high demand") ||
        msg.includes("rate limit") ||
        msg.includes("429");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * attempt; // 5s, 10s, 15s
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
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
    raw = await withRetry(async () => {
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
      return data.choices?.[0]?.message?.content ?? "";
    });
  } else if (provider === "gemini_paid") {
    const apiKey = settings.geminiApiKey || settings.rssAiApiKey;
    if (!apiKey) throw new Error("API key do Gemini não configurada. Configure em Configurações → API Gemini.");
    const model = settings.rssAiModel || "gemini-2.0-flash";
    const ai = new GoogleGenAI({ apiKey });
    raw = await withRetry(async () => {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 8192 },
      });
      return resp.text ?? "";
    });
  } else {
    // Default: gemini_free (Replit integration)
    const ai    = getGeminiFree();
    const model = settings.rssAiModel || "gemini-2.0-flash";
    raw = await withRetry(async () => {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 8192 },
      });
      return resp.text ?? "";
    });
  }

  return parseRewriteResult(raw);
}

// ─── Diffbot scraping ─────────────────────────────────────────────────────────

interface DiffbotArticle {
  title?: string;
  text?: string;
  html?: string;
  images?: Array<{ url?: string; primary?: boolean }>;
}

interface DiffbotResponse {
  objects?: DiffbotArticle[];
  errorCode?: number;
  error?: string;
}

/**
 * Extracts an article using the Diffbot Article API.
 * Returns null if the key is not configured or the request fails.
 */
export async function scrapeWithDiffbot(
  url: string,
  apiKey: string,
): Promise<{ title: string; text: string; imageUrl: string } | null> {
  try {
    const endpoint = `https://api.diffbot.com/v3/article?url=${encodeURIComponent(url)}&token=${encodeURIComponent(apiKey)}&discussion=false`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json() as DiffbotResponse;
    if (data.errorCode || !data.objects?.length) return null;
    const obj = data.objects[0];
    const imageUrl =
      obj.images?.find((i) => i.primary)?.url ??
      obj.images?.[0]?.url ??
      "";
    return {
      title:    obj.title ?? "",
      text:     obj.text  ?? "",
      imageUrl,
    };
  } catch {
    return null;
  }
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
  const items = feed.items.slice(0, src.fetchLimit ?? 3);

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

  // Skip duplicates — check by title, source URL, image URL, or similar wording
  if (store.isDuplicateArticle(art.title, art.link, art.imageUrl)) {
    addLog({ type: "duplicate", sourceName, articleTitle: art.title, message: "Artigo duplicado — ignorado" });
    logger.info({ title: art.title }, "Skipping duplicate RSS article");
    return;
  }

  addLog({ type: "fetch", sourceName, articleTitle: art.title });

  let content         = art.fullText;
  let keywords        = "";
  let slug            = "";
  let aiRewriteSuccess = false;
  let aiTitle:    string | undefined;
  let aiSubtitle: string | undefined;
  let author          = giveCredit ? `Redação (via ${sourceName})` : "Redação";

  if (autoMode === "rewrite_draft" || autoMode === "rewrite_publish") {
    try {
      const prompts = store.getRssPrompts();
      const chosenPrompt = resolvePrompt(src, prompts);
      const result = await rewriteWithAI(art.title, art.fullText, sourceName, giveCredit, chosenPrompt);
      content          = result.content;
      keywords         = result.keywords;
      slug             = result.slug;
      aiTitle          = result.title    || undefined;
      aiSubtitle       = result.subtitle || undefined;
      aiRewriteSuccess = true;
      addLog({ type: "rewrite", sourceName, articleTitle: aiTitle ?? art.title });
    } catch (err) {
      // Feature: skip articles that fail rewrite instead of saving raw text
      addLog({ type: "error", sourceName, articleTitle: art.title, message: `Reescrita falhou: ${String(err)}` });
      logger.warn({ err, sourceId: src.id }, "AI rewrite failed — skipping article");
      return;
    }
  }

  const status = (autoMode === "publish" || autoMode === "rewrite_publish")
    ? "published" : "draft";

  store.createArticle({
    title:         aiTitle    ?? art.title,
    subtitle:      aiSubtitle ?? art.excerpt.slice(0, 160),
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

  addLog({
    type:          status === "published" ? "publish" : "draft",
    sourceName,
    articleTitle:  aiTitle ?? art.title,
    message:       status === "published" ? "Publicado" : "Salvo como rascunho",
  });
}

/** Full pipeline: fetch source, process each article */
const MAX_PER_ROUND = 3;

export async function processDueSource(src: RssSource): Promise<number> {
  const articles = await fetchSourceArticles(src); // already capped at 3 by fetchSourceArticles
  let processed = 0;
  for (const art of articles) {
    if (processed >= MAX_PER_ROUND) break;
    if (store.isDuplicateArticle(art.title, art.link, art.imageUrl)) {
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
