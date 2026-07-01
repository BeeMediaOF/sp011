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

export function buildArticleCaption(
  a: CaptionArticleInput,
  template: string,
  base: string | null,
): string {
  const b = (base ?? "").replace(/\/+$/, "");
  const slugOrId = a.slug || a.id || "";
  const link = b && slugOrId ? `${b}/artigo/${slugOrId}` : "";
  const excerpt = makeExcerpt(a.content ?? "", 240);
  const summary = a.socialSummary?.trim() || a.subtitle?.trim() || excerpt;
  const hashtags =
    a.socialHashtags?.trim() ||
    hashtagsFromKeywords(a.keywords ?? "", [a.category]) ||
    undefined;
  const publishedAt =
    a.publishedAt instanceof Date
      ? a.publishedAt.toISOString()
      : typeof a.publishedAt === "string"
        ? a.publishedAt
        : undefined;

  return resolveCaption(template || DEFAULT_CAPTION_TEMPLATE, {
    title: a.title,
    category: a.category,
    subtitle: a.subtitle || undefined,
    author: a.author || undefined,
    imageUrl: a.imageUrl || undefined,
    publishedAt,
    excerpt,
    summary,
    hashtags,
    link,
    site: siteDomain(b),
  });
}
