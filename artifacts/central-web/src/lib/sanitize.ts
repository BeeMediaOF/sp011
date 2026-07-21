/**
 * Sanitização de HTML antes de renderizar no painel central (PRD-04b).
 * O conteúdo vem do pipeline de IA (fonte externa reescrita) e do editor
 * manual — nunca deve chegar ao DOM cru (XSS armazenado → sink da cadeia AP-1:
 * exfiltra o central_token do admin). central-web é 100% client-side, então
 * DOMPurify roda sempre (window existe) — não precisa da variante SSR do blog.
 */
import DOMPurify from "dompurify";

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
