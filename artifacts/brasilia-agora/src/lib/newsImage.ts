/**
 * Utilitários para imagens responsivas do portal.
 *
 * ESTRATÉGIA:
 * As imagens do metroimg usam imgproxy com hash HMAC que cobre o path completo,
 * portanto não podem ser redimensionadas diretamente pelo frontend.
 * O backend expõe GET /api/image?url=...&w=...&q=... que busca, redimensiona
 * e converte para WebP via sharp, com cache em disco + memória.
 *
 * buildSrcSet() gera srcset apontando para esse proxy para qualquer URL de imagem
 * cujo domínio esteja na allowlist do backend.
 * Fallback: o atributo `src` original é sempre mantido para o caso do proxy falhar.
 */

/** Domínios cujas imagens passam pelo proxy. Deve espelhar ALLOWED_HOSTS em image.ts */
const PROXY_HOSTS = new Set([
  // metroimg CDN principal
  "images.metroimg.com",
  "i.metroimg.com",
  "static.metroimg.com",
  // EBC / Agência Brasil
  "imagens.ebc.com.br",
  "agenciabrasil.ebc.com.br",
  // fontes RSS em uso no portal
  "media.investnews.com.br",
  "www.cartacapital.com.br",
  "www.brasildefato.com.br",
  "medias.revistaoeste.com",
  "uploads.finsidersbrasil.com.br",
  "finsidersbrasil.com.br",
  "cdn.jornaldebrasilia.com.br",
  "media-manager.noticiasaominuto.com.br",
  // UOL / Band
  "img.uol.com.br",
  "conteudo.imguol.com.br",
  "imagem.band.uol.com.br",
  // Wikimedia
  "upload.wikimedia.org",
]);

/**
 * Gera URL do proxy de imagens para uma largura específica.
 * Retorna a URL original se o domínio não estiver na allowlist.
 */
export function proxyUrl(src: string, w: number, q = 82): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) return src;

  let hostname: string;
  try {
    hostname = new URL(src).hostname;
  } catch {
    return src;
  }

  if (!PROXY_HOSTS.has(hostname)) return src;

  return `/api/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

/**
 * Gera string `srcset` com múltiplas larguras via proxy.
 * Retorna "" se o domínio não for suportado (browser usa `src` diretamente).
 */
export function buildSrcSet(src: string, widths: number[], q = 82): string {
  if (!src || src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) return "";

  let hostname: string;
  try {
    hostname = new URL(src).hostname;
  } catch {
    return "";
  }

  if (!PROXY_HOSTS.has(hostname)) return "";

  return widths.map((w) => `${proxyUrl(src, w, q)} ${w}w`).join(", ");
}

/**
 * Retorna URL de imagem redimensionada via proxy (equivale a proxyUrl).
 * Mantido para compatibilidade com código existente.
 */
export function metroResize(src: string, w: number, h?: number): string {
  // h é ignorado pois o proxy usa apenas a largura e mantém proporção.
  void h;
  return proxyUrl(src, w);
}

/** Larguras para cards de notícia (thumbnails e destaques médios). */
export const CARD_WIDTHS = [320, 480, 640, 960];

/** Larguras para imagens hero (ocupam 33–100% da viewport). */
export const HERO_WIDTHS = [480, 768, 1024, 1280];

/** Larguras para miniaturas pequenas (strip/sidebar, ≤ 120px). */
export const THUMB_WIDTHS = [120, 240, 360];
