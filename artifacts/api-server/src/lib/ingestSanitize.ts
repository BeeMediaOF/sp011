/**
 * Sanitização server-side do corpo de artigo NA ENTRADA (F7 dos PRDs 01–05).
 * Antes o contentHtml do ingest era gravado cru e a defesa ficava só no
 * render (DOMPurify no cliente / stripDangerousHtml no SSR) — HTML malicioso
 * dormia no banco e vazava por qualquer consumidor novo (AMP, feeds, API).
 *
 * ESPELHO de `brasilia-agora/src/lib/sanitize.ts` (stripDangerousHtml) — a
 * allowlist efetiva é "tudo menos executável". Mudou lá, muda AQUI também.
 */
export function sanitizeIngestHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, "");
}
