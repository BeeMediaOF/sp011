/**
 * Utilitários para imagens responsivas de portais de notícia.
 *
 * SITUAÇÃO DO CDN:
 * O metroimg usa imgproxy com hash HMAC que cobre o path completo
 * (incluindo parâmetros de resize). Sem a chave de assinatura, não é
 * possível gerar variantes menores a partir do frontend.
 *
 * O que fazemos:
 * - buildSrcSet → retorna "" para todas as URLs externas (sem 403 extras)
 * - CLS → eliminado via containers com aspect-ratio em todos os componentes
 * - LCP → via fetchpriority="high" + loading="eager" nas imagens acima da dobra
 * - Payload → redução virá quando o backend processar imagens via sharp/CDN próprio
 *
 * Se no futuro o backend expor um endpoint de resize próprio (ex: /api/img?url=...&w=400),
 * basta implementar metroResize() para apontar para esse endpoint e buildSrcSet() voltará a funcionar.
 */

/**
 * Gera string srcset. Atualmente retorna vazio pois as URLs externas
 * exigem assinatura para resize. Mantida para uso futuro.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildSrcSet(_src: string, _widths: number[]): string {
  return "";
}

/**
 * Redimensiona uma URL de imagem. Stub para uso futuro com CDN próprio.
 */
export function metroResize(src: string, _w: number, _h?: number): string {
  return src;
}

/** Larguras para cards de notícia (thumbnails e destaques médios). */
export const CARD_WIDTHS = [240, 480, 720, 960];

/** Larguras para imagens hero (ocupam 33–100% da viewport). */
export const HERO_WIDTHS = [480, 800, 1200, 1600];

/** Larguras para miniaturas pequenas (strip/sidebar, ≤ 120px). */
export const THUMB_WIDTHS = [120, 240, 360];
