import type { ArticleData } from "./types";
import { resolveContent } from "./resolveContent";

/**
 * Template de legenda padrão (editável nas configurações sociais).
 * Usa os mesmos placeholders do template de imagem.
 */
export const DEFAULT_CAPTION_TEMPLATE =
  "{{title}}\n\n{{summary}}\n\n📲 Leia a matéria completa: {{link}}\n\n{{hashtags}}";

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
 * Constrói hashtags a partir das keywords geradas pela IA (lista separada por
 * vírgula) + extras. Ex.: "eleições 2026, brasília" → "#eleicoes2026 #brasilia".
 * Retorna "" quando não há nada aproveitável (o caller decide o fallback).
 */
export function hashtagsFromKeywords(keywords: string, extra: string[] = [], limit = 8): string {
  const fromKw = (keywords ?? "").split(/[,\n;]+/).map((k) => k.trim());
  const tags = [...fromKw, ...extra].map(toHashtag).filter(Boolean);
  return Array.from(new Set(tags)).slice(0, limit).join(" ");
}

/**
 * Extrai um trecho inicial legível do corpo da matéria (aceita HTML): remove
 * tags, decodifica entidades comuns, colapsa espaços e corta na fronteira de
 * palavra, adicionando reticências quando trunca.
 */
export function makeExcerpt(htmlOrText: string, maxChars = 240): string {
  const text = (htmlOrText ?? "")
    .replace(/<\/(p|h[1-6]|li|div|br)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trim() + "…";
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
