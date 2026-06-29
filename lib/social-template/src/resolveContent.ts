import type { ArticleData } from "./types";

/**
 * Substitui os placeholders do template/legenda pelos dados do artigo.
 * Suporta: {{title}} {{subtitle}} {{category}} {{CATEGORY}} (maiúsculo)
 *          {{author}} {{date}} {{site}} {{link}} {{hashtags}}
 *
 * Importante: {{CATEGORY}} (caixa-alta) é resolvido ANTES de {{category}}
 * (case-insensitive), senão o segundo "comeria" o token maiúsculo.
 */
export function resolveContent(content: string, a: ArticleData): string {
  const date = a.publishedAt
    ? safeDate(a.publishedAt)
    : "";
  return (content ?? "")
    .replace(/\{\{\s*title\s*\}\}/gi, a.title ?? "")
    .replace(/\{\{\s*subtitle\s*\}\}/gi, a.subtitle ?? "")
    .replace(/\{\{\s*CATEGORY\s*\}\}/g, (a.category ?? "").toUpperCase())
    .replace(/\{\{\s*category\s*\}\}/gi, a.category ?? "")
    .replace(/\{\{\s*author\s*\}\}/gi, a.author ?? "")
    .replace(/\{\{\s*date\s*\}\}/gi, date)
    .replace(/\{\{\s*site\s*\}\}/gi, a.site ?? "")
    .replace(/\{\{\s*link\s*\}\}/gi, a.link ?? "")
    .replace(/\{\{\s*hashtags\s*\}\}/gi, a.hashtags ?? "");
}

function safeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
