/**
 * Quality gate e recuperação de JSON bruto — cópia direta de
 * `api-server/src/lib/rewriteQueue.ts` (funções puras).
 */
import { sanitizePlainField, sanitizeSocialTitle } from "./highlight.ts";

export interface ExtractedAI {
  content: string;
  title?: string;
  subtitle?: string;
  socialTitle?: string;
  socialSummary?: string;
  socialHashtags?: string;
  keywords?: string;
  slug?: string;
}

/**
 * Extrai campos estruturados de uma resposta bruta de IA de forma robusta.
 *
 * Corrige o bug em que o parser padrão cai no fallback de texto puro quando a
 * IA devolve `\n\`\`\`json\n{...}` (newline antes da cerca): aqui o `.trim()`
 * vem ANTES do regex, então a cerca está sempre na posição 0.
 *
 * Retorna null quando o conteúdo não é HTML válido nem um blob JSON
 * extraível — ou seja, o artigo deve ser re-tentado ou descartado.
 */
export function extractFromRawAI(raw: string): ExtractedAI | null {
  if (!raw || raw.trim().length < 20) return null;

  // ── Passo 1: remover cercas markdown ─────────────────────────────────────
  // IMPORTANTE: trim() ANTES do regex para newlines iniciais não quebrarem o ^
  const stripped = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // ── Passo 2: HTML/prosa pura → mantém como está ──────────────────────────
  if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
    return stripped.length > 20 ? { content: stripped } : null;
  }

  // ── Passo 3: tentativa de JSON.parse limpo ───────────────────────────────
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    const content = (
      (parsed["content_html"] as string | undefined) ??
      (parsed["contentHtml"] as string | undefined) ??
      (parsed["content"] as string | undefined) ??
      ""
    ).trim();
    if (content.length > 20) {
      return {
        content,
        title: sanitizePlainField(((parsed["title"] as string | undefined) ?? "").trim()) || undefined,
        subtitle: sanitizePlainField(((parsed["subtitle"] as string | undefined) ?? "").trim()) || undefined,
        socialTitle: sanitizeSocialTitle(((parsed["social_title"] as string | undefined) ?? "").trim()) || undefined,
        socialSummary: sanitizePlainField(((parsed["social_summary"] as string | undefined) ?? "").trim()) || undefined,
        socialHashtags: sanitizePlainField(((parsed["social_hashtags"] as string | undefined) ?? "").trim()) || undefined,
        keywords: sanitizePlainField(((parsed["keywords"] as string | undefined) ?? "").trim()) || undefined,
        slug: ((parsed["slug"] as string | undefined) ?? "").trim() || undefined,
      };
    }
  } catch { /* cai para o regex */ }

  // ── Passo 4: fallback regex para JSON truncado ───────────────────────────
  const mHtml = stripped.match(/"content_html"\s*:\s*"([\s\S]+?)(?:(?<!\\)"\s*[,}]|(?<!\\)"\s*$)/);
  if (mHtml?.[1]) {
    const content = mHtml[1]
      .replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
    if (content.length > 20) {
      const mTitle = stripped.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSub = stripped.match(/"subtitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSocial = stripped.match(/"social_title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSummary = stripped.match(/"social_summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mTags = stripped.match(/"social_hashtags"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mKw = stripped.match(/"keywords"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const mSlug = stripped.match(/"slug"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      return {
        content,
        title: sanitizePlainField(mTitle?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        subtitle: sanitizePlainField(mSub?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        socialTitle: sanitizeSocialTitle(mSocial?.[1]?.replace(/\\"/g, '"').trim() || "") || undefined,
        socialSummary: sanitizePlainField(mSummary?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        socialHashtags: sanitizePlainField(mTags?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        keywords: sanitizePlainField(mKw?.[1]?.replace(/\\"/g, '"').trim() ?? "") || undefined,
        slug: mSlug?.[1]?.replace(/\\"/g, '"').trim() || undefined,
      };
    }
  }

  return null; // realmente inextraível
}

/**
 * True se o conteúdo pode ser renderizado ao leitor.
 * HTML e texto puro sempre passam; conteúdo JSON-like só é aceito quando um
 * campo `content_html` (ou similar) pode ser extraído dele.
 */
export function isContentRenderable(content: string): boolean {
  return extractFromRawAI(content) !== null;
}
