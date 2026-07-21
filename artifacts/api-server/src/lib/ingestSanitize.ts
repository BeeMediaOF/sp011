/**
 * Sanitização server-side do corpo de artigo NA ENTRADA do ingest (PRD-04a).
 *
 * Delega à política CANÔNICA ÚNICA do repo (`@workspace/news-engine/sanitize`,
 * baseada em parser cheerio). Antes eram quatro cadeias de regex ESPELHADAS de
 * `brasilia-agora/src/lib/sanitize.ts` (drift garantido, contornáveis por
 * `<svg onload>`/`<math>`/tag malformada). Agora a política é única e por
 * parser — mudou lá, muda em todos os consumidores automaticamente.
 */
import { sanitizeArticleHtml } from "@workspace/news-engine/sanitize";

export function sanitizeIngestHtml(html: string): string {
  return sanitizeArticleHtml(html);
}
