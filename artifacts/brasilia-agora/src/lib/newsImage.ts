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

/** Como dimensionar um asset de identidade na entrega. */
export type SiteAssetSize =
  /** Caixa quadrada (favicon, avatar de assinatura): a largura limita. */
  | { w: number }
  /**
   * Logo: o CSS fixa `style={{ height }}` e deixa a largura livre, então a
   * ALTURA é a restrição real. Pedir por largura exigiria saber a proporção da
   * imagem, que só o servidor conhece — a logo do KSports é 1080x300 e, exibida
   * a 120 px de altura, ocupa 432 px; um `w=320` fazia o navegador dar upscale
   * e borrava a marca.
   */
  | { h: number };

/**
 * Acrescenta `&w=`/`&h=` a uma URL `/api/site-asset/…`, de onde vêm as logos e o
 * avatar de assinatura. Devolve a entrada INALTERADA para qualquer outra coisa:
 * o mesmo campo das settings ainda chega como data URI quando o payload vem do
 * localStorage antigo ou de um blog que não passou pelo /api/site novo, e um
 * `&w=` colado num `data:` quebraria a imagem.
 *
 * Substitui `w`/`h` que já estejam na URL — o backend publica um padrão por
 * campo, e o componente sabe melhor que tamanho precisa (1x vs 2x).
 */
export function siteAssetUrl(src: string, size: SiteAssetSize | number): string {
  if (!src.startsWith(SITE_ASSET_PREFIX)) return src;
  const spec = typeof size === "number" ? { w: size } : size;
  const [path, query = ""] = src.split("?");
  const params = query
    .split("&")
    .filter((p) => p && !p.startsWith("w=") && !p.startsWith("h="));
  params.push("w" in spec ? `w=${spec.w}` : `h=${spec.h}`);
  return `${path}?${params.join("&")}`;
}

/** Dobra a dimensão pedida, preservando o eixo (largura ou altura). */
function double(size: SiteAssetSize | number): SiteAssetSize {
  const spec = typeof size === "number" ? { w: size } : size;
  return "w" in spec ? { w: spec.w * 2 } : { h: spec.h * 2 };
}

/**
 * `srcSet` 1x/2x para um asset de identidade. Tela 2x recebe o dobro — sem isso
 * a logo, agora entregue no tamanho de exibição, sairia serrilhada em retina.
 */
export function siteAssetSrcSet(
  src: string,
  size: SiteAssetSize | number,
): string | undefined {
  if (!src.startsWith(SITE_ASSET_PREFIX)) return undefined;
  return `${siteAssetUrl(src, size)} 1x, ${siteAssetUrl(src, double(size))} 2x`;
}

/** Larguras para cards de notícia (thumbnails e destaques médios). */
export const CARD_WIDTHS = [320, 480, 640, 960];

/**
 * Larguras para caixas que RECORTAM a foto (`object-cover`) — cards retrato e
 * faixas panorâmicas.
 *
 * Nessas caixas o `sizes` não pode ser a largura do card: o navegador escolhe o
 * candidato pela largura, mas o recorte precisa cobrir também a ALTURA. Num
 * card 3:4 de 296x395 preenchido por uma foto 16:10, a origem precisa ter
 * `395 x 1,6 = 632 px` de largura — pedir 320 fazia o navegador ampliar ~2x e
 * era a borra vista na home do credito.vc (2026-08-14). Por isso a menor
 * largura aqui é 480 e existe um degrau de 1280 (a faixa 16:6 do layout
 * revista ocupa os 1248 px inteiros do container).
 */
export const COVER_WIDTHS = [480, 640, 960, 1280];

/** Qualidade WebP das caixas de recorte: a foto É o card, sem texto ao redor
 *  para disfarçar artefato. 82 continua o padrão do resto da home. */
export const COVER_Q = 86;

/**
 * Proporções das caixas que RECORTAM a foto, como `altura ÷ largura`.
 *
 * A mesma entrada alimenta a classe `aspect-[…]` do Tailwind e o `srcSet` —
 * é de propósito: enquanto os dois eram escritos à mão em lugares diferentes,
 * o card 3:4 do grid de zonas ficou pedindo `sizes="320px"` para uma caixa que
 * precisa de ~700 px, e a foto subia 2,2x (borrão do oleysports, 2026-08-14).
 */
export const COVER_ASPECTS = {
  "3/4": 4 / 3,
  "4/3": 3 / 4,
  "3/2": 2 / 3,
  "16/9": 9 / 16,
  "16/10": 10 / 16,
  "16/7": 7 / 16,
  "16/6": 6 / 16,
} as const;

export type CoverAspect = keyof typeof COVER_ASPECTS;

/**
 * Escada de larguras do recorte no servidor. Começa mais baixa que
 * `COVER_WIDTHS` porque aqui o candidato JÁ é a largura da caixa: sumiu o
 * acréscimo que existia só para cobrir a altura. Um card de 296 px pega 320 na
 * tela 1x e 640 na 2x.
 */
export const COVER_CROP_WIDTHS = [240, 320, 480, 640, 960, 1280];

/** Classe Tailwind da proporção — a fonte é a mesma do `srcSet`. */
export function aspectClass(a: CoverAspect): string {
  return `aspect-[${a}]`;
}

/**
 * `srcSet` de uma caixa de proporção FIXA preenchida com `object-cover`.
 *
 * Cada candidato já vem do servidor recortado na proporção da caixa
 * (`&h=&fit=cover`), então o navegador não amplia nem descarta pixel — o
 * `sizes` do chamador passa a ser simplesmente a largura CSS da caixa, que é a
 * conta que todo mundo já faz certo.
 *
 * Ganha nos dois lados: um card 3:4 de foto 16:9 saía em 1280x720 (155 KB) para
 * mostrar a faixa central; agora sai em 539x720 (70 KB) e sem ampliação.
 *
 * Devolve "" quando a origem não passa pelo proxy (o `<img>` cai no `src`
 * inteiro, como já fazia) — recorte no servidor exige servidor.
 */
export function coverSrcSet(
  src: string,
  aspect: CoverAspect,
  widths: number[] = COVER_CROP_WIDTHS,
  q = COVER_Q,
): string {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return "";
  const razao = COVER_ASPECTS[aspect];

  const monta = (w: number): string => {
    const h = Math.round(w * razao);
    return src.startsWith("/api/uploads/")
      ? `${src}?w=${w}&h=${h}&q=${q}&f=webp&fit=cover`
      : `/api/image?url=${encodeURIComponent(src)}&w=${w}&h=${h}&q=${q}&fit=cover`;
  };

  if (src.startsWith("/api/uploads/")) {
    return widths.map((w) => `${monta(w)} ${w}w`).join(", ");
  }
  if (src.startsWith("/")) return "";

  let hostname: string;
  try {
    hostname = new URL(src).hostname;
  } catch {
    return "";
  }
  if (!isProxyableHost(hostname)) return "";

  return widths.map((w) => `${monta(w)} ${w}w`).join(", ");
}

/** Larguras para imagens hero (ocupam 33–100% da viewport). */
export const HERO_WIDTHS = [480, 768, 1024, 1280];

/** Larguras para miniaturas pequenas (strip/sidebar, ≤ 120px). */
export const THUMB_WIDTHS = [120, 240, 360];
