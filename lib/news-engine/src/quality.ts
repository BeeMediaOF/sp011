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

/** Texto visível de um HTML (sem tags/entidades, espaços colapsados). */
export function plainTextOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comprimento do texto visível de um HTML (sem tags, espaços colapsados) —
 * régua dos gates de "matéria curta demais" (fonte incompleta ou reescrita
 * que saiu um toco).
 */
export function plainTextLength(html: string): number {
  return plainTextOf(html).length;
}

/** Normalização p/ comparação: minúsculas e sem acentos (NFD - combining). */
function normForCompare(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Guarda contra manchete social com palavra inventada/colada pelo modelo
 * (incidente sp011 2026-07: arte publicada com "garantivaga" em vez de
 * "garante vaga"): toda palavra com 5+ letras da manchete precisa aparecer no
 * material da própria matéria (título + subtítulo + corpo). Comparação sem
 * acentos/caixa; asteriscos do *destaque* separam palavras e não interferem.
 */
export function socialTitleMatchesSource(socialTitle: string, sourceText: string): boolean {
  const hay = normForCompare(sourceText);
  const words = normForCompare(socialTitle).match(/[a-z]{5,}/g) ?? [];
  return words.every((w) => hay.includes(w));
}

/** Título cortado no limite da arte (85), sem cortar palavra no meio. */
export function socialTitleFromTitle(title: string, max = 85): string {
  const t = title.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : t.slice(0, max)).trim();
}

/**
 * Escolhe a manchete social SEGURA para a arte: a da IA quando todas as
 * palavras batem com o material; senão o próprio título (cortado). Fallback
 * benigno — perde o "punch" da manchete, nunca publica palavra colada.
 */
export function bestSocialTitle(
  candidate: string | null | undefined,
  title: string,
  sourceText: string,
): string | null {
  const cand = candidate?.trim();
  if (cand && socialTitleMatchesSource(cand, sourceText)) return cand;
  return socialTitleFromTitle(title) || cand || null;
}
