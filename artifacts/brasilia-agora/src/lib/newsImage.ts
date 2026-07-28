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
  // CDN (CloudFront) de fonte EN do ksports — host exato, distribuição fixa
  "d2me2qg8dfiw8u.cloudfront.net",
  // Painel central — capas enviadas na "Nova notícia" (/api/news/image/...)
  "central.midia.run",
]);

/** Sufixos de CDNs das fontes internacionais (esportes/EN) — subdomínios variam
 *  (a1.espncdn.com, e0.365dm.com…). Deve espelhar ALLOWED_HOST_SUFFIXES em
 *  api-server/src/routes/image.ts. */
const PROXY_HOST_SUFFIXES = [
  ".espncdn.com", ".bbci.co.uk", ".365dm.com", ".skysports.com",
  ".guim.co.uk", ".yimg.com", ".zenfs.com", ".reuters.com",
  ".formula1.com", ".motorsport.com", ".autosport.com",
  ".atptour.com", ".wtatennis.com", ".volleyballworld.com",
  ".nfl.com", ".cbsistatic.com", ".brightspotcdn.com",
  ".talksport.com", ".goal.com", ".dexerto.com", ".esports.gg",
  // Hosts reais vistos nos artigos do ksports (levantamento no banco, 2026-07-08)
  ".dailymail.com", ".dailymail.co.uk", ".independent.co.uk",
  ".mirror.co.uk", ".foxsports.com", ".minutemediacdn.com",
  ".offtheblockblog.com", ".esportsinsider.com",
  // Fontes PT de esporte (2026-07-20) — espelho do image.ts (mudar nos DOIS)
  ".glbimg.com", ".gazetaesportiva.com", ".trivela.com.br",
  ".tenisnews.com.br", ".theplayoffs.news",
];

function isProxyableHost(hostname: string): boolean {
  return PROXY_HOSTS.has(hostname) ||
    PROXY_HOST_SUFFIXES.some((s) => hostname.endsWith(s) || hostname === s.slice(1));
}

/**
 * Gera URL do proxy de imagens para uma largura específica.
 * Retorna a URL original se o domínio não estiver na allowlist.
 */
export function proxyUrl(src: string, w: number, q = 82): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  // Imagens enviadas pelo próprio portal: o endpoint /api/uploads aceita resize.
  if (src.startsWith("/api/uploads/")) {
    return `${src}?w=${w}&q=${q}&f=webp`;
  }

  // Demais paths locais (favicon, assets versionados) não passam pelo proxy.
  if (src.startsWith("/")) return src;

  let hostname: string;
  try {
    hostname = new URL(src).hostname;
  } catch {
    return src;
  }

  if (!isProxyableHost(hostname)) return src;

  return `/api/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}

/**
 * Gera string `srcset` com múltiplas larguras via proxy.
 * Retorna "" se o domínio não for suportado (browser usa `src` diretamente).
 */
export function buildSrcSet(src: string, widths: number[], q = 82): string {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return "";

  // Imagens enviadas pelo portal passam pelo resize do /api/uploads.
  if (src.startsWith("/api/uploads/")) {
    return widths.map((w) => `${proxyUrl(src, w, q)} ${w}w`).join(", ");
  }

  // Demais paths locais não têm versões redimensionadas → sem srcset.
  if (src.startsWith("/")) return "";

  let hostname: string;
  try {
    hostname = new URL(src).hostname;
  } catch {
    return "";
  }

  if (!isProxyableHost(hostname)) return "";

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

const SITE_ASSET_PREFIX = "/api/site-asset/";

/**
 * Acrescenta `&w=` a uma URL `/api/site-asset/…`, de onde vêm as logos e o
 * avatar de assinatura. Devolve a entrada INALTERADA para qualquer outra coisa:
 * o mesmo campo das settings ainda chega como data URI quando o payload vem do
 * localStorage antigo ou de um blog que não passou pelo /api/site novo, e um
 * `&w=` colado num `data:` quebraria a imagem.
 *
 * Substitui um `w` que já esteja na URL — o backend publica um `w` padrão por
 * campo, e o componente sabe melhor que largura precisa (1x vs 2x).
 */
export function siteAssetUrl(src: string, w: number): string {
  if (!src.startsWith(SITE_ASSET_PREFIX)) return src;
  const [path, query = ""] = src.split("?");
  const params = query.split("&").filter((p) => p && !p.startsWith("w="));
  params.push(`w=${w}`);
  return `${path}?${params.join("&")}`;
}

/**
 * `srcSet` 1x/2x para um asset de identidade. Tela 2x recebe o dobro da largura
 * — sem isso a logo, agora entregue no tamanho de exibição, sairia serrilhada
 * em retina.
 */
export function siteAssetSrcSet(src: string, w: number): string | undefined {
  if (!src.startsWith(SITE_ASSET_PREFIX)) return undefined;
  return `${siteAssetUrl(src, w)} 1x, ${siteAssetUrl(src, w * 2)} 2x`;
}

/** Larguras para cards de notícia (thumbnails e destaques médios). */
export const CARD_WIDTHS = [320, 480, 640, 960];

/** Larguras para imagens hero (ocupam 33–100% da viewport). */
export const HERO_WIDTHS = [480, 768, 1024, 1280];

/** Larguras para miniaturas pequenas (strip/sidebar, ≤ 120px). */
export const THUMB_WIDTHS = [120, 240, 360];
