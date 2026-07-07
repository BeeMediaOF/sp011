/**
 * Reescrita de notícia por IA — porte de `rewriteWithAI` do
 * `api-server/src/lib/rssProcessor.ts`, com provider/chaves/modelo INJETADOS
 * (nada lê settings/store) e retorno do consumo de tokens quando disponível.
 *
 * Providers do motor: "gemini" (pool com rodízio), "openai" e "ollama"
 * (self-hosted). O mapeamento das configurações do app para este contrato é
 * responsabilidade do chamador.
 */
import { sanitizePlainField, sanitizeSocialTitle } from "../highlight.ts";
import {
  applyPromptTemplate, DEFAULT_PROMPT_TEMPLATE,
  TRANSLATION_PROMPT_TEMPLATE, CLASSIFY_PROMPT_TEMPLATE,
  formatCategoriesForPrompt, languageLabel,
} from "../prompts.ts";
import { consoleLogger, type EngineLogger, type TokenUsage } from "../types.ts";
import type { GeminiPool } from "./geminiPool.ts";

export interface RewriteResult {
  content: string;
  keywords: string;
  slug: string;
  title?: string;
  subtitle?: string;
  /** Título curto p/ a arte social (pode conter *destaque*). */
  socialTitle?: string;
  /** Resumo curto p/ a legenda das redes. */
  socialSummary?: string;
  /** Hashtags p/ a legenda das redes. */
  socialHashtags?: string;
}

export interface RewriteOutput extends RewriteResult {
  usage?: TokenUsage;
}

/** Reduz o slug a no máximo 5 palavras significativas e 55 chars, cortando em hífen. */
export function trimSlug(raw: string): string {
  const s = raw.trim().toLowerCase();

  const STOP = new Set(["o", "a", "os", "as", "de", "da", "do", "dos", "das", "para", "com", "em", "e", "ou", "um", "uma", "no", "na", "nos", "nas", "ao", "aos", "pela", "pelo", "por", "que"]);
  const words = s.split("-").filter((w) => w.length > 0);
  const significant = words.filter((w) => !STOP.has(w));

  const chosen = significant.slice(0, 5).join("-");

  if (chosen.length <= 55) return chosen;
  const cut = chosen.slice(0, 55);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen > 10 ? cut.slice(0, lastHyphen) : cut;
}

export function parseRewriteResult(raw: string): RewriteResult {
  // Remove cercas markdown quando o modelo envolve a saída em ```json ... ```
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Tenta parsear como JSON (formato novo)
  if (stripped.startsWith("{")) {
    try {
      const parsed = JSON.parse(stripped) as {
        title?: string; subtitle?: string; social_title?: string;
        social_summary?: string; social_hashtags?: string;
        content_html?: string; slug?: string; keywords?: string;
      };
      const content = (parsed.content_html ?? "").trim();
      const keywords = sanitizePlainField((parsed.keywords ?? "").trim());
      const slug = trimSlug(parsed.slug ?? "");
      const title = sanitizePlainField((parsed.title ?? "").trim());
      const subtitle = sanitizePlainField((parsed.subtitle ?? "").trim());
      const socialTitle = sanitizeSocialTitle((parsed.social_title ?? "").trim()) || undefined;
      const socialSummary = sanitizePlainField((parsed.social_summary ?? "").trim()) || undefined;
      const socialHashtags = sanitizePlainField((parsed.social_hashtags ?? "").trim()) || undefined;
      if (content) return { content, keywords, slug, title, subtitle, socialTitle, socialSummary, socialHashtags };
    } catch { /* tenta o fallback regex abaixo */ }

    // Fallback regex para JSON truncado/malformado
    const mHtml = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:"\s*[,}]|"\s*$)/);
    if (mHtml?.[1]) {
      const content = mHtml[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
      const mTitle = stripped.match(/"title"\s*:\s*"([^"]+)"/);
      const mSub = stripped.match(/"subtitle"\s*:\s*"([^"]+)"/);
      const mSocial = stripped.match(/"social_title"\s*:\s*"([^"]+)"/);
      const mSummary = stripped.match(/"social_summary"\s*:\s*"([^"]+)"/);
      const mTags = stripped.match(/"social_hashtags"\s*:\s*"([^"]+)"/);
      const mSlug = stripped.match(/"slug"\s*:\s*"([^"]+)"/);
      const mKw = stripped.match(/"keywords"\s*:\s*"([^"]+)"/);
      return {
        content,
        title: sanitizePlainField(mTitle?.[1]?.trim() ?? ""),
        subtitle: sanitizePlainField(mSub?.[1]?.trim() ?? ""),
        socialTitle: sanitizeSocialTitle(mSocial?.[1]?.trim() ?? "") || undefined,
        socialSummary: sanitizePlainField(mSummary?.[1]?.trim() ?? "") || undefined,
        socialHashtags: sanitizePlainField(mTags?.[1]?.trim() ?? "") || undefined,
        slug: trimSlug(mSlug?.[1] ?? ""),
        keywords: sanitizePlainField(mKw?.[1]?.trim() ?? ""),
      };
    }
  }

  // Fallback: formato antigo de texto puro com marcadores SLUG:/KEYWORDS:
  const slugMatch = raw.match(/^SLUG:\s*(.+)$/m);
  const keywordsMatch = raw.match(/^KEYWORDS:\s*(.+)$/m);
  const slug = trimSlug((slugMatch?.[1] ?? "").replace(/^\[|\]$/g, ""));
  const keywords = (keywordsMatch?.[1] ?? "").trim().replace(/^\[|\]$/g, "");
  const content = raw
    .replace(/^SLUG:\s*.+$/m, "")
    .replace(/^KEYWORDS:\s*.+$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content, keywords, slug };
}

// ─── Providers ────────────────────────────────────────────────────────────────

interface OpenAiLikeUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAiLikeResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenAiLikeUsage;
}

/**
 * Chama um servidor Ollama self-hosted pelo endpoint compatível com OpenAI.
 * Sem API key; inferência em CPU é lenta, então o timeout é generoso.
 */
async function callOllama(
  baseUrl: string,
  model: string,
  prompt: string,
): Promise<{ text: string; usage?: OpenAiLikeUsage }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      response_format: { type: "json_object" }, // força JSON válido
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(300_000), // 5 min — CPU é lento
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama: ${res.status} ${res.statusText} ${err}`.trim());
  }
  const data = await res.json() as OpenAiLikeResponse;
  return { text: data.choices?.[0]?.message?.content ?? "", usage: data.usage };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  baseUrl?: string,
): Promise<{ text: string; usage?: OpenAiLikeUsage }> {
  // Endpoint compatível com OpenAI: permite Groq, OpenRouter, DeepSeek,
  // Mistral etc. só trocando a base URL nas configurações.
  const url = `${(baseUrl || "https://api.openai.com").replace(/\/+$/, "")}/v1/chat/completions`;
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
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
        throw new Error(`OpenAI: ${res.status} ${err?.error?.message ?? res.statusText}`);
      }
      const data = await res.json() as OpenAiLikeResponse;
      return { text: data.choices?.[0]?.message?.content ?? "", usage: data.usage };
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (msg.includes("429")) {
        throw new Error(`QUOTA_COOLDOWN:Cota da API OpenAI esgotada. ${msg}`);
      }
      const retryable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("overloaded");
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 5_000 * attempt));
    }
  }
  throw lastErr;
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export type RewriteProvider = "gemini" | "openai" | "ollama";

export interface RewriteEngineConfig {
  provider: RewriteProvider;
  /** Modelo do provider escolhido (defaults: gemini-2.5-flash / gpt-4o-mini / qwen2.5:7b-instruct). */
  model?: string;
  /** Obrigatório para provider "gemini" (e para o fallback do Ollama). */
  geminiPool?: GeminiPool;
  openaiApiKey?: string;
  /** Endpoint compatível com OpenAI (Groq/OpenRouter/DeepSeek…). Default: api.openai.com. */
  openaiBaseUrl?: string;
  ollamaBaseUrl?: string;
  /** Ollama indisponível → cai para o Gemini (requer geminiPool). Default true. */
  fallbackToGemini?: boolean;
  logger?: EngineLogger;
}

export interface RewriteInput {
  title: string;
  text: string;
  sourceName: string;
  giveCredit: boolean;
  /** Template já resolvido (com placeholders {{TITULO}} etc.). Default: template padrão. */
  promptTemplate?: string;
}

export async function rewriteNews(input: RewriteInput, cfg: RewriteEngineConfig): Promise<RewriteOutput> {
  const logger = cfg.logger ?? consoleLogger;
  const prompt = applyPromptTemplate(
    input.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
    input.title, input.text, input.sourceName, input.giveCredit,
  );

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaBaseUrl || "http://ollama:11434";
    const model = cfg.model || "qwen2.5:7b-instruct";
    try {
      const { text, usage } = await callOllama(baseUrl, model, prompt);
      return {
        ...parseRewriteResult(text),
        usage: {
          provider: "ollama", model,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (ollamaErr) {
      if (!(cfg.fallbackToGemini ?? true) || !cfg.geminiPool) throw ollamaErr;
      logger.warn({ err: String(ollamaErr) }, "Ollama indisponível — caindo para fallback Gemini");
      const { text, usage } = await cfg.geminiPool.call("gemini-2.5-flash", prompt);
      return { ...parseRewriteResult(text), usage };
    }
  }

  if (cfg.provider === "openai") {
    if (!cfg.openaiApiKey) throw new Error("API key da OpenAI não configurada");
    const model = cfg.model || "gpt-4o-mini";
    const { text, usage } = await callOpenAI(cfg.openaiApiKey, model, prompt, cfg.openaiBaseUrl);
    return {
      ...parseRewriteResult(text),
      usage: {
        provider: "openai", model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
    };
  }

  // gemini
  if (!cfg.geminiPool) throw new Error("geminiPool é obrigatório para provider \"gemini\"");
  const model = cfg.model || "gemini-2.5-flash";
  const { text, usage } = await cfg.geminiPool.call(model, prompt);
  return { ...parseRewriteResult(text), usage };
}

// ─── Localizer: tradução + classificação por entrega ─────────────────────────

/**
 * Despacho de UMA chamada de texto pelo provider configurado (mesmo contrato
 * do rewriteNews, sem o parse) — usado por translateRewrite/classifyArticle.
 */
async function callTextModel(
  prompt: string, cfg: RewriteEngineConfig,
): Promise<{ text: string; usage?: TokenUsage }> {
  const logger = cfg.logger ?? consoleLogger;

  if (cfg.provider === "ollama") {
    const baseUrl = cfg.ollamaBaseUrl || "http://ollama:11434";
    const model = cfg.model || "qwen2.5:7b-instruct";
    try {
      const { text, usage } = await callOllama(baseUrl, model, prompt);
      return {
        text,
        usage: {
          provider: "ollama", model,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        },
      };
    } catch (ollamaErr) {
      if (!(cfg.fallbackToGemini ?? true) || !cfg.geminiPool) throw ollamaErr;
      logger.warn({ err: String(ollamaErr) }, "Ollama indisponível — caindo para fallback Gemini");
      return cfg.geminiPool.call("gemini-2.5-flash", prompt);
    }
  }

  if (cfg.provider === "openai") {
    if (!cfg.openaiApiKey) throw new Error("API key da OpenAI não configurada");
    const model = cfg.model || "gpt-4o-mini";
    const { text, usage } = await callOpenAI(cfg.openaiApiKey, model, prompt, cfg.openaiBaseUrl);
    return {
      text,
      usage: {
        provider: "openai", model,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      },
    };
  }

  if (!cfg.geminiPool) throw new Error("geminiPool é obrigatório para provider \"gemini\"");
  return cfg.geminiPool.call(cfg.model || "gemini-2.5-flash", prompt);
}

/** Extrai o campo `category` do JSON bruto da IA (tolerante a JSON malformado). */
export function extractCategoryField(raw: string): string | undefined {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped) as { category?: unknown };
    if (typeof parsed.category === "string" && parsed.category.trim()) {
      return parsed.category.trim().toLowerCase();
    }
  } catch { /* tenta regex abaixo */ }
  const m = stripped.match(/"category"\s*:\s*"([^"]+)"/);
  return m?.[1]?.trim().toLowerCase() || undefined;
}

export interface TranslateInput {
  title: string;
  subtitle?: string;
  socialTitle?: string;
  socialSummary?: string;
  socialHashtags?: string;
  contentHtml: string;
  keywords?: string;
  /** Idioma de destino ("en" | "pt-BR"). */
  targetLanguage: string;
  /** Taxonomia do blog — a MESMA chamada devolve `category`; vazia = sem classificação. */
  categories?: Array<{ slug: string; hint?: string }>;
  /** Template custom (settings do painel); default TRANSLATION_PROMPT_TEMPLATE. */
  promptTemplate?: string;
}

export interface TranslateOutput extends RewriteResult {
  usage?: TokenUsage;
  /** Slug de categoria escolhido pela IA (já validado contra a lista) ou undefined. */
  category?: string;
}

/**
 * Traduz uma reescrita para o idioma do blog de destino. Monta o prompt
 * SOZINHO (nunca via applyPromptTemplate, que trunca {{TEXTO}} em 7.000 chars
 * e cortaria o artigo no meio) — o cap defensivo aqui é ~20k chars.
 */
export async function translateRewrite(
  input: TranslateInput, cfg: RewriteEngineConfig,
): Promise<TranslateOutput> {
  const categories = input.categories ?? [];
  const prompt = (input.promptTemplate?.trim() || TRANSLATION_PROMPT_TEMPLATE)
    .replace(/\{\{IDIOMA_DESTINO\}\}/g, languageLabel(input.targetLanguage))
    .replace(/\{\{TITULO\}\}/g, input.title)
    .replace(/\{\{SUBTITULO\}\}/g, input.subtitle ?? "")
    .replace(/\{\{SOCIAL_TITLE\}\}/g, input.socialTitle ?? "")
    .replace(/\{\{SOCIAL_SUMMARY\}\}/g, input.socialSummary ?? "")
    .replace(/\{\{SOCIAL_HASHTAGS\}\}/g, input.socialHashtags ?? "")
    .replace(/\{\{KEYWORDS\}\}/g, input.keywords ?? "")
    .replace(/\{\{CONTEUDO\}\}/g, input.contentHtml.slice(0, 20_000))
    .replace(/\{\{CATEGORIAS\}\}/g, formatCategoriesForPrompt(categories));

  const { text, usage } = await callTextModel(prompt, cfg);
  const parsed = parseRewriteResult(text);
  const rawCategory = extractCategoryField(text);
  const valid = rawCategory && categories.some((c) => c.slug.toLowerCase() === rawCategory);
  return { ...parsed, usage, category: valid ? rawCategory : undefined };
}

export interface ClassifyInput {
  title: string;
  summary?: string;
  categories: Array<{ slug: string; hint?: string }>;
  /** Template custom; default CLASSIFY_PROMPT_TEMPLATE. */
  promptTemplate?: string;
}

export interface ClassifyOutput {
  /** Slug validado contra a lista, ou null quando a IA não decidiu. */
  category: string | null;
  usage?: TokenUsage;
}

/**
 * Classificação barata (só título + resumo, sem o corpo) para o caso
 * classificação-sem-tradução (ex.: fonte EN → blog EN). NUNCA lança por
 * resposta inválida — devolve null e o chamador aplica o fallback.
 */
export async function classifyArticle(
  input: ClassifyInput, cfg: RewriteEngineConfig,
): Promise<ClassifyOutput> {
  if (input.categories.length === 0) return { category: null };
  const prompt = (input.promptTemplate?.trim() || CLASSIFY_PROMPT_TEMPLATE)
    .replace(/\{\{TITULO\}\}/g, input.title)
    .replace(/\{\{RESUMO\}\}/g, (input.summary ?? "").slice(0, 1_000))
    .replace(/\{\{CATEGORIAS\}\}/g, formatCategoriesForPrompt(input.categories));

  const { text, usage } = await callTextModel(prompt, cfg);
  // JSON {"category": "slug"} ou, em último caso, o slug cru na resposta.
  const fromJson = extractCategoryField(text);
  const raw = (fromJson ?? text.trim().toLowerCase().replace(/^["']|["']$/g, "")).trim();
  const match = input.categories.find((c) => c.slug.toLowerCase() === raw);
  return { category: match ? match.slug : null, usage };
}
