import type { ArticleData } from "./types";
import { resolveContent } from "./resolveContent";

/**
 * Template de legenda padrão (editável nas configurações sociais).
 * Usa os mesmos placeholders do template de imagem.
 */
export const DEFAULT_CAPTION_TEMPLATE =
  "{{title}}\n\n{{subtitle}}\n\n📲 Leia a matéria completa no nosso site (link na bio).\n\n{{hashtags}}";

/** Normaliza um texto em uma hashtag (#semacentos, minúscula, sem espaços). */
export function toHashtag(text: string): string {
  const slug = (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return slug ? `#${slug}` : "";
}

/**
 * Monta a lista de hashtags a partir da categoria do artigo + extras fixas
 * (ex.: a marca). Remove vazias e duplicadas, preserva a ordem.
 */
export function buildHashtags(category: string, extra: string[] = []): string {
  const tags = [toHashtag(category), ...extra.map(toHashtag)].filter(Boolean);
  return Array.from(new Set(tags)).join(" ");
}

/**
 * Resolve a legenda final de um post a partir do template + dados do artigo.
 * Se `article.hashtags` não vier pronto, derivamos da categoria + `brandTags`.
 */
export function resolveCaption(
  template: string,
  article: ArticleData,
  brandTags: string[] = [],
): string {
  const hashtags = article.hashtags ?? buildHashtags(article.category, brandTags);
  const resolved = resolveContent(template || DEFAULT_CAPTION_TEMPLATE, {
    ...article,
    hashtags,
  });
  // Colapsa 3+ quebras de linha em no máximo 2 (quando subtitle/hashtags vazios).
  return resolved.replace(/\n{3,}/g, "\n\n").trim();
}
