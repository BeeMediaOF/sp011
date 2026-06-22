/**
 * RSS Processor — shared logic used by both the route handler and the scheduler.
 * Handles scraping, AI rewrite, and auto-import of articles.
 */

import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { store, type RssSource, type RssAutoMode } from "./store.js";
import { articleService } from "./articleService.js";
import { logger } from "./logger.js";
import { db, rssEventLogsTable } from "@workspace/db";

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

export function addLog(entry: Omit<RssLogEntry, "id" | "ts">) {
  const id = Math.random().toString(36).slice(2);
  const ts = new Date().toISOString();
  _rssEventLog.unshift({ id, ts, ...entry });
  if (_rssEventLog.length > MAX_LOG) _rssEventLog.pop();

  // Persist to DB asynchronously (fire and forget)
  db.insert(rssEventLogsTable).values({
    id,
    ts:           new Date(),
    type:         entry.type,
    sourceName:   entry.sourceName,
    articleTitle: entry.articleTitle,
    message:      entry.message ?? null,
  }).catch(() => { /* swallow — memory log already captured */ });
}

export function getRssLog(): RssLogEntry[] { return [..._rssEventLog]; }

// ─── Rewrite Queue callback (registered by rewriteQueue.ts to avoid circular imports) ────

export interface RewriteJobItem {
  articleId: string;
  title: string;
  text: string;
  sourceName: string;
  giveCredit: boolean;
  customPrompt?: string;
  finalStatus: "published" | "draft";
}

let _rewriteQueue: ((item: RewriteJobItem) => void) | null = null;

export function registerRewriteQueue(fn: (item: RewriteJobItem) => void): void {
  _rewriteQueue = fn;
}

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

**TÍTULO:** Elabore um título único de cauda longa com cerca de 150 caracteres, altamente chamativo e otimizado para SEO de entidades e para o Google Discover. Cite o assunto principal e entidades importantes. NÃO repita o título dentro do content_html.

**SUBTÍTULO:** Crie um subtítulo com cerca de 150 caracteres que complemente o título e introduza o texto, ele será o primeiro <h2> dentro do content_html.

**CONTEÚDO (content_html):**
- Comece com o subtítulo como primeiro <h2> dentro do content_html
- Após o H2, escreva uma lead com 3 parágrafos curtos introduzindo o assunto e fazendo um gancho para o que o leitor irá encontrar
- Ao final da lead, cite obrigatoriamente a fonte: por exemplo, "conforme informação divulgada por {{FONTE}}"
- Escreva como jornalista — NUNCA escreva como se você fosse um redator da própria fonte; cite as informações atribuindo corretamente a origem
- Use até 4 subtítulos <h3> para organizar o restante do texto
- Parágrafos curtos: 150 a 250 caracteres cada — faça muitos parágrafos curtos
- Extraia citações diretas e dados estatísticos presentes na fonte e inclua-os no texto, garantindo que sejam 100% fiéis ao original; se a citação estiver em idioma estrangeiro, traduza-a para o Português do Brasil
- Utilize a palavra-chave principal (extraída do título) no título, no subtítulo e distribuída ao longo do texto; use também palavras-chave correlacionadas
- Use <b> para negritos em palavras e frases importantes, NUNCA use ** ou outras marcações markdown
- Prefira texto corrido; use <ul><li> apenas quando necessário para a didática do conteúdo
- NUNCA coloque <h1> dentro do content_html
- NUNCA use travessões (—), use sempre vírgula
- NUNCA escreva códigos de idioma como "pt-BR", "en-US" ou similares em nenhuma parte da resposta
- Linguagem clara, acessível e fácil de entender pelo público brasileiro
- Somente use informações presentes no conteúdo da fonte, nunca invente dados

**METADADOS:**
- slug: kebab-case sem acentos, MÁXIMO 5 PALAVRAS SIGNIFICATIVAS (ignore artigos: o, a, os, as, de, da, do, dos, das, para, com, em, e, ou, um, uma). Exemplo: "prefeito-inaugura-hospital-sao-paulo" (5 palavras). NUNCA gere slug com mais de 55 caracteres.
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

function getGeminiDirect() {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada. Adicione sua chave gratuita do Google AI Studio em aistudio.google.com.");
  return new GoogleGenAI({ apiKey });
}

export interface RewriteResult {
  content: string;
  keywords: string;
  slug: string;
  title?: string;
  subtitle?: string;
}

/** Trim slug to at most 5 meaningful words and 55 chars, cutting at a word boundary */
function trimSlug(raw: string): string {
  // Normalise: lowercase, remove accents, replace spaces with hyphens
  const s = raw.trim().toLowerCase();

  // Split on hyphens, filter out single-char stop-words
  const STOP = new Set(["o","a","os","as","de","da","do","dos","das","para","com","em","e","ou","um","uma","no","na","nos","nas","ao","aos","pela","pelo","por","que"]);
  const words = s.split("-").filter(w => w.length > 0);
  const significant = words.filter(w => !STOP.has(w));

  // Take up to 5 significant words; rebuild slug
  const chosen = significant.slice(0, 5).join("-");

  // Hard cap at 55 chars, always cutting at a hyphen boundary
  if (chosen.length <= 55) return chosen;
  const cut = chosen.slice(0, 55);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 10 ? cut.slice(0, lastHyphen) : cut;
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
    const slug     = trimSlug(parsed.slug ?? "");
    const title    = (parsed.title ?? "").trim();
    const subtitle = (parsed.subtitle ?? "").trim();
    return { content, keywords, slug, title, subtitle };
  } catch {
    // Fallback: old plain-text format with SLUG:/KEYWORDS: markers
    const slugMatch     = raw.match(/^SLUG:\s*(.+)$/m);
    const keywordsMatch = raw.match(/^KEYWORDS:\s*(.+)$/m);
    const slug     = trimSlug((slugMatch?.[1] ?? "").replace(/^\[|\]$/g, ""));
    const keywords = (keywordsMatch?.[1] ?? "").trim().replace(/^\[|\]$/g, "");
    const content  = raw
      .replace(/^SLUG:\s*.+$/m, "")
      .replace(/^KEYWORDS:\s*.+$/m, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { content, keywords, slug };
  }
}

// ─── AI Quota Manager ─────────────────────────────────────────────────────────

const DEFAULT_DAILY_LIMIT = 18; // safety margin under the 20 free-tier req/day
const MIN_CALL_INTERVAL_MS = 3_000; // 3 s between successive AI calls

interface QuotaState {
  dateKey: string;
  usedToday: number;
  cooldownUntil: number; // ms timestamp; 0 = no cooldown
}

let _quota: QuotaState = { dateKey: "", usedToday: 0, cooldownUntil: 0 };
let _lastCallTime = 0;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function refreshDay() {
  const today = todayKey();
  if (_quota.dateKey !== today) {
    _quota = { dateKey: today, usedToday: 0, cooldownUntil: 0 };
  }
}

function parseCooldownMs(errMsg: string): number {
  const m = errMsg.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1]!) * 1_000) + 3_000; // +3s buffer
  return 65_000;
}

export function getAIQuotaStatus() {
  refreshDay();
  const now = Date.now();
  const dailyLimit = DEFAULT_DAILY_LIMIT;
  const cooldownRemainingMs = Math.max(0, _quota.cooldownUntil - now);
  return {
    usedToday: _quota.usedToday,
    dailyLimit,
    remaining: Math.max(0, dailyLimit - _quota.usedToday),
    isQuotaExhausted: _quota.usedToday >= dailyLimit,
    isOnCooldown: cooldownRemainingMs > 0,
    cooldownRemainingMs,
    cooldownUntil: _quota.cooldownUntil || null,
  };
}

function checkQuota() {
  refreshDay();
  const now = Date.now();
  if (now < _quota.cooldownUntil) {
    const secs = Math.ceil((_quota.cooldownUntil - now) / 1_000);
    throw new Error(`QUOTA_COOLDOWN:Limite de requisições atingido. Aguardando ${secs}s antes de chamar a AI novamente.`);
  }
  if (_quota.usedToday >= DEFAULT_DAILY_LIMIT) {
    throw new Error(`QUOTA_EXHAUSTED:Limite diário de ${DEFAULT_DAILY_LIMIT} requisições de AI atingido. Tente novamente amanhã.`);
  }
}

async function enforceCallInterval() {
  const now = Date.now();
  const wait = MIN_CALL_INTERVAL_MS - (now - _lastCallTime);
  if (_lastCallTime > 0 && wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  _lastCallTime = Date.now();
}

/** Retry helper — retries on 503/UNAVAILABLE; on 429 sets cooldown and throws immediately */
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

      // On 429: set cooldown and abort immediately — do NOT retry
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
        const cooldownMs = parseCooldownMs(msg);
        _quota.cooldownUntil = Date.now() + cooldownMs;
        logger.warn({ cooldownMs, msg }, "AI quota exceeded — cooldown set");
        throw new Error(`QUOTA_COOLDOWN:Cota da API de AI esgotada. Aguardando ${Math.ceil(cooldownMs / 1_000)}s.`);
      }

      const isRetryable =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded") ||
        msg.includes("high demand");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function rewriteWithAI(
  title: string, text: string, sourceName: string, giveCredit: boolean, customPrompt?: string
): Promise<RewriteResult> {
  checkQuota();
  await enforceCallInterval();

  const settings = store.getSettings();
  // Default: gemini_direct (GEMINI_API_KEY env var, Google AI Studio free tier)
  // Falls back to gemini_paid (settings key) or gemini_free (Replit integration)
  const provider = settings.rssAiProvider ?? (process.env["GEMINI_API_KEY"] ? "gemini_direct" : "gemini_paid");
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
  } else if (provider === "gemini_direct") {
    // Google AI Studio free tier — uses GEMINI_API_KEY env var, no Replit credits
    const ai    = getGeminiDirect();
    const model = settings.rssAiModel || "gemini-2.0-flash";
    raw = await withRetry(async () => {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 8192 },
      });
      return resp.text ?? "";
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
    // gemini_free: Replit AI Integrations (uses Replit credits)
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

  _quota.usedToday++;
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
export async function scrapeArticle(url: string): Promise<{ text: string; imageUrl: string; description: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SBC-Agora/1.0; +https://sbcagora.com.br)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { text: "", imageUrl: "", description: "" };
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Featured image from meta tags (og:image is the article's canonical share image)
    const metaImage =
      $("meta[property='og:image:secure_url']").attr("content") ||
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image:src']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      $("link[rel='image_src']").attr("href") ||
      $("meta[itemprop='image']").attr("content") ||
      $("meta[name='thumbnail']").attr("content") ||
      "";

    // 2. Extract primary article figure image as a more reliable fallback
    //    (catches cases where og:image is missing, wrong, or JS-rendered)
    const BODY_IMG_SELECTORS = [
      "article figure img",
      ".article-image img", ".article-img img", ".article__image img",
      ".post-image img", ".entry-image img",
      "[class*='featured-image'] img", "[class*='destaque'] img",
      "figure.featured img", "figure.hero img",
      ".article-body figure:first-of-type img",
      "article .content figure:first-of-type img",
      "[itemprop='image'] img",
    ];
    let bodyImage = "";
    for (const sel of BODY_IMG_SELECTORS) {
      const src =
        $(sel).first().attr("src") ||
        $(sel).first().attr("data-src") ||
        $(sel).first().attr("data-lazy-src");
      if (src && src.startsWith("http") && !src.includes("logo") && !src.includes("pixel") && !src.includes("icon")) {
        bodyImage = src;
        break;
      }
    }

    // Prefer meta og:image; fall back to article body image
    const imageUrl = metaImage || bodyImage;

    const description =
      $("meta[property='og:description']").attr("content") ??
      $("meta[name='description']").attr("content") ??
      $("meta[name='twitter:description']").attr("content") ??
      "";

    // 2. Remove noise — structural elements + common Brazilian news site widgets
    $([
      "script","style","nav","header","footer","aside",
      ".ad",".advertisement",".sidebar",".menu",".popup",
      "[class*='cookie']","[class*='banner']","[id*='cookie']",
      "figure figcaption","noscript",
      // Agência Brasil / EBC specific
      ".destaques-ebc",".radio-agencia",".tv-brasil",
      // Related / recommended articles sections
      ".relacionadas",".related",".related-news",
      ".mais-noticias",".mais-lidas",".mais-conteudo",
      ".ver-mais",".leia-mais",".read-more",
      "[class*='read-more']","[class*='leia-mais']","[class*='relacionad']",
      "[class*='recommended']","[class*='sugest']","[class*='widget']",
      // Social / newsletter
      ".tags-list",".tags",".article-tags",
      ".compartilhe",".share",".social-share",
      ".newsletter",".newsletter-box",
      ".breadcrumb",".breadcrumbs",
      // Ad slots
      ".gpt-ad",".gam-ad","[id*='gpt']","[id*='taboola']",
      "[data-type='_mgwidget']","[class*='mgwidget']",
      // Paywall UI elements
      ".paywall",".subscription",".premium-content",
      ".edicao",".edition-bar",
      ".article-footer",".post-footer",
      // InfoMoney / Brazilian financial news specifics
      ".wp-block-infomoney-blocks-infomoney-read-more",
      "[class*='infomoney-read-more']",
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

    // Ad-separator patterns to skip at paragraph level
    const AD_SEPARATOR = /^(continua depois da publicidade|continua após (a )?publicidade|publicidade|advertisement|sponsored content|conteúdo patrocinado)$/i;

    /** Extract paragraphs from an element, preserving structure */
    function extractParagraphs(el: ReturnType<typeof $>): string {
      const paras: string[] = [];
      el.find("p, h2, h3, h4, li").each((_i, node) => {
        const tag  = (node as { tagName?: string }).tagName?.toLowerCase() ?? "p";
        const t    = $(node).text().replace(/\s+/g, " ").trim();
        if (t.length < 20) return;
        // Skip ad separators that appear mid-article
        if (AD_SEPARATOR.test(t)) return;
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
    //    Prefer article/main-scoped paragraphs to avoid related-article snippets
    if (!text) {
      const pSource = $("article").length ? $("article") : $("main").length ? $("main") : $("body");
      text = pSource
        .find("p")
        .map((_i, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter((t) => t.length > 50 && !AD_SEPARATOR.test(t))
        .join("\n\n");
    }

    // 5. Post-processing: truncate at common "end of article" sentinels
    //    (inline navigation/widgets that DOM removal didn't catch)
    //    NOTE: "Publicidade" is intentionally excluded — it appears mid-article
    //    as "Continua depois da publicidade" on many Brazilian sites and is
    //    handled at paragraph level by AD_SEPARATOR above.
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

    return { text: text.slice(0, 8000), imageUrl, description };
  } catch {
    return { text: "", imageUrl: "", description: "" };
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
  if (await articleService.isDuplicateArticle(art.title, art.link, art.imageUrl)) {
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

  // ── Ghost-publication guard ────────────────────────────────────────────────
  // Articles without an image should never be auto-published; downgrade to draft.
  const hasImage = !!art.imageUrl?.trim();
  const hasText  = !!art.fullText?.trim();

  if (autoMode === "rewrite_draft" || autoMode === "rewrite_publish") {
    if (_rewriteQueue) {
      // Queue mode: save as draft immediately, then rewrite asynchronously.
      // Skip if there's nothing to rewrite.
      if (!hasText) {
        addLog({ type: "skip", sourceName, articleTitle: art.title, message: "Ignorado: sem conteúdo para reescrever" });
        return;
      }
      const finalStatus = autoMode === "rewrite_publish" ? "published" : "draft";
      const prompts = store.getRssPrompts();
      const chosenPrompt = resolvePrompt(src, prompts);
      const draftReason = !hasImage ? "no_image" : undefined;
      const saved = await articleService.createArticle({
        title:         art.title,
        subtitle:      art.excerpt.slice(0, 160),
        content:       art.fullText,
        category,
        tag:           TAG_MAP[category] ?? "GERAL",
        imageUrl:      art.imageUrl,
        author,
        publishedAt:   new Date().toISOString(),
        status:        "draft",
        origin:        "rss",
        rssSourceId:   art.sourceId,
        rssSourceName: art.sourceName,
        rssSourceUrl:  art.link,
        aiRewritten:   false,
        draftReason,
      });
      _rewriteQueue({
        articleId:   saved.id,
        title:       art.title,
        text:        art.fullText,
        sourceName,
        giveCredit,
        customPrompt: chosenPrompt,
        finalStatus,
      });
      addLog({ type: "draft", sourceName, articleTitle: art.title, message: "Salvo — aguardando reescrita na fila" });
      logger.info({ articleId: saved.id, finalStatus }, "Article queued for AI rewrite");
      return;
    }
    // Fallback (no queue registered): rewrite immediately
    try {
      const prompts = store.getRssPrompts();
      const chosenPrompt = resolvePrompt(src, prompts);
      const result = await rewriteWithAI(art.title, art.fullText, sourceName, giveCredit, chosenPrompt);
      content          = result.content || art.fullText; // fallback to original if AI returns empty
      keywords         = result.keywords;
      slug             = result.slug;
      aiTitle          = result.title    || undefined;
      aiSubtitle       = result.subtitle || undefined;
      aiRewriteSuccess = true;
      addLog({ type: "rewrite", sourceName, articleTitle: aiTitle ?? art.title });
    } catch (err) {
      addLog({ type: "error", sourceName, articleTitle: art.title, message: `Reescrita falhou: ${String(err)}` });
      logger.warn({ err, sourceId: src.id }, "AI rewrite failed — skipping article");
      return;
    }
  }

  // Validate final content — use fullText as fallback if AI produced nothing
  const finalContent = content?.trim() || art.fullText?.trim() || "";
  const draftReason = !hasImage ? "no_image" : (!finalContent ? "no_content" : undefined);

  // Force draft if ghost-publication guard triggers
  const intendedStatus = (autoMode === "publish" || autoMode === "rewrite_publish")
    ? "published" : "draft";
  const status: "draft" | "published" = draftReason ? "draft" : intendedStatus;

  if (draftReason) {
    addLog({ type: "draft", sourceName, articleTitle: aiTitle ?? art.title, message: `Salvo como rascunho: ${draftReason}` });
  }

  if (!finalContent && !hasImage) {
    // Completely empty article — skip entirely rather than save garbage
    addLog({ type: "skip", sourceName, articleTitle: art.title, message: "Ignorado: sem imagem nem conteúdo" });
    return;
  }

  await articleService.createArticle({
    title:         aiTitle    ?? art.title,
    subtitle:      aiSubtitle ?? art.excerpt.slice(0, 160),
    content:       finalContent,
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
    draftReason,
  });

  if (!draftReason) {
    addLog({
      type:          status === "published" ? "publish" : "draft",
      sourceName,
      articleTitle:  aiTitle ?? art.title,
      message:       status === "published" ? "Publicado" : "Salvo como rascunho",
    });
  }
}

/** Full pipeline: fetch source, process each article */
const MAX_PER_ROUND = 3;

export async function processDueSource(src: RssSource): Promise<number> {
  const articles = await fetchSourceArticles(src); // already capped at 3 by fetchSourceArticles
  let processed = 0;
  for (const art of articles) {
    if (processed >= MAX_PER_ROUND) break;
    if (await articleService.isDuplicateArticle(art.title, art.link, art.imageUrl)) {
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
