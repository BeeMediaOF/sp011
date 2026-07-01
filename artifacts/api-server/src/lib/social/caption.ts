/**
 * Monta a legenda final de um post social a partir do template + dados do artigo.
 * Fonte única usada tanto pela automação (autoScheduler) quanto pelo preview
 * manual (endpoint /caption-preview), garantindo resolução idêntica.
 *
 * Resolve os placeholders novos:
 *  - {{excerpt}} → trecho inicial real do corpo (sem HTML)
 *  - {{summary}} → resumo da IA (social_summary) → cai p/ subtítulo → cai p/ trecho
 *  - {{hashtags}} → hashtags da IA (social_hashtags) → derivadas das keywords → categoria
 *  - {{link}}    → {base}/artigo/{slug|id}
 */
import {
  resolveCaption,
  makeExcerpt,
  hashtagsFromKeywords,
  toHashtag,
  DEFAULT_CAPTION_TEMPLATE,
} from "@workspace/social-template";

export interface CaptionArticleInput {
  id?: string | null;
  title: string;
  category: string;
  subtitle?: string | null;
  author?: string | null;
  imageUrl?: string | null;
  content?: string | null;
  keywords?: string | null;
  slug?: string | null;
  socialSummary?: string | null;
  socialHashtags?: string | null;
  publishedAt?: Date | string | null;
}

function siteDomain(base: string): string {
  if (!base) return "";
  try { return new URL(base).host.replace(/^www\./, ""); } catch { return ""; }
}

/** True se o template usa o placeholder `{{name}}` (case-insensitive). */
function usesVar(template: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "i").test(template);
}

export type CaptionMissing = "resumo" | "link" | "hashtags";

export interface CaptionAnalysis {
  caption: string;
  summary: string;
  hashtags: string;
  link: string;
  /** Placeholders que o template pede mas que ficaram vazios (ex.: legenda sem link). */
  missing: CaptionMissing[];
}

/**
 * Resolve a legenda E diagnostica o que ficou faltando: quando o template usa
 * {{summary}}/{{link}}/{{hashtags}} mas o valor resolveu para vazio, isso vira
 * um item em `missing` — usado pela automação para NÃO publicar posts incompletos.
 */
export function analyzeArticleCaption(
  a: CaptionArticleInput,
  template: string,
  base: string | null,
): CaptionAnalysis {
  const tpl = template || DEFAULT_CAPTION_TEMPLATE;
  const b = (base ?? "").replace(/\/+$/, "");
  const slugOrId = a.slug || a.id || "";
  const link = b && slugOrId ? `${b}/artigo/${slugOrId}` : "";
  const excerpt = makeExcerpt(a.content ?? "", 240);
  const summary = a.socialSummary?.trim() || a.subtitle?.trim() || excerpt;
  const hashtags =
    a.socialHashtags?.trim() ||
    hashtagsFromKeywords(a.keywords ?? "", [a.category]) ||
    toHashtag(a.category);
  const publishedAt =
    a.publishedAt instanceof Date
      ? a.publishedAt.toISOString()
      : typeof a.publishedAt === "string"
        ? a.publishedAt
        : undefined;

  const caption = resolveCaption(tpl, {
    title: a.title,
    category: a.category,
    subtitle: a.subtitle || undefined,
    author: a.author || undefined,
    imageUrl: a.imageUrl || undefined,
    publishedAt,
    excerpt,
    summary,
    hashtags: hashtags || undefined,
    link,
    site: siteDomain(b),
  });

  const missing: CaptionMissing[] = [];
  if (usesVar(tpl, "summary")  && !summary)  missing.push("resumo");
  if (usesVar(tpl, "link")     && !link)     missing.push("link");
  if (usesVar(tpl, "hashtags") && !hashtags) missing.push("hashtags");

  return { caption, summary, hashtags, link, missing };
}

export function buildArticleCaption(
  a: CaptionArticleInput,
  template: string,
  base: string | null,
): string {
  return analyzeArticleCaption(a, template, base).caption;
}
