/**
 * Modelo compartilhado dos blocos da home + helpers puros.
 *
 * O tipo do bloco (imagem, carrossel, vídeo…) é persistido em `blockType`.
 * Blocos criados por versões antigas do painel não têm o campo — o tipo é
 * inferido do prefixo do id ("image-1719848…" → "image") por inferBlockType().
 */

import type { FooterConfig } from "./footerConfig";

export type HomeBlockLayout =
  | "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete"
  | "mosaico" | "trio" | "compact" | "bigstory" | "timeline" | "portal"
  | "overlay" | "magazine";

export type HomeBlockType =
  | "content" | "image" | "carousel" | "video" | "advertising" | "list"
  | "ticker" | "newsletter" | "categories" | "quotes" | "social"
  | "html" | "embed" | "map" | "sep" | "weather" | "table" | "counter";

export interface HomeBlock {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  category?: string;
  layout?: HomeBlockLayout;
  color?: string;
  custom?: boolean;
  reverse?: boolean;
  /** Tipo do bloco. Ausente em blocos antigos → inferBlockType(). */
  blockType?: string;
  /** Variação visual dentro do tipo (ex.: image_card, full_width_image). */
  format?: string;
  /** Origem dos artigos (content/carousel/list/ticker). */
  source?: string;
  /** Quantidade máxima de itens exibidos. */
  itemsLimit?: number;
  /** Bloco de imagem: URL da imagem (upload ou externa). */
  imageUrl?: string;
  /** Link de destino ao clicar (imagem/banner). */
  linkUrl?: string;
  /** Legenda da imagem ou texto auxiliar (ex.: chamada da newsletter). */
  caption?: string;
  /** Bloco de vídeo: URL do YouTube/Vimeo ou arquivo .mp4/.webm. */
  videoUrl?: string;
  /** Bloco HTML: markup livre (sanitizado no render). */
  html?: string;
  /** Bloco embed/mapa: URL externa exibida em iframe (somente https). */
  embedUrl?: string;
  /** Bloco de propaganda: slot do AdBanner. */
  adSlot?: string;
  /** Bloco de propaganda: exibir UMA propaganda específica do cadastro (por id). */
  adId?: string;
  /** Zona da home: blocos consecutivos com area formam a zona de 2 colunas
   *  (coluna principal + lateral de 320px). Ausente = fluxo clássico. */
  area?: "main" | "sidebar";
  /** Largura parcial: blocos consecutivos "half"/"quarter" (sem area) formam
   *  fileiras lado a lado (2 ou 4 colunas no desktop). */
  width?: "full" | "half" | "quarter";
  /** Texto do link do cabeçalho de seção nos renderizadores de zona (padrão "Ver mais"). */
  linkLabel?: string;
  /** Bloco de imagem/HTML marcado como propaganda — listado na aba Propagandas do admin. */
  isAd?: boolean;
}

/** Item de menu carregado por um template (mesmo shape do menu do site). */
export interface TemplateMenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
  newTab?: boolean;
  highlight?: boolean;
  /** Submenu (1 nível). */
  children?: TemplateMenuItem[];
}

/** Template de home salvo no painel (aba Templates de Blocos da Home):
 *  snapshot completo dos blocos + estilos de cabeçalho/rodapé/menu. */
export interface HomeTemplate {
  id: string;
  name: string;
  createdAt: string;
  /** Cor de destaque do card na aba Templates. */
  accentColor?: string;
  /** Modelos embutidos no painel (não excluíveis) — nunca persistidos. */
  builtin?: boolean;
  blocks: HomeBlock[];
  headerStyle?: "standard" | "compact" | "centered";
  footerStyle?: "dark" | "light" | "minimal";
  headerBgColor?: string;
  footerBgColor?: string;
  menuTextColor?: string;
  menuActiveColor?: string;
  menuFontSize?: number;
  menuFontWeight?: number;
  headerPaddingX?: number;
  headerMarginTop?: number;
  showTickerBar?: boolean;
  showHeroStrip?: boolean;
  /** Itens de menu instalados ao aplicar (ausente = menu do site não é tocado). */
  menuItems?: TemplateMenuItem[];
  /** Rodapé completo aplicado junto (ausente = rodapé do site não é tocado). */
  footerConfig?: FooterConfig;
  /** Campos "portal" — ao aplicar um template SEM eles, recebem reset neutro
   *  (templates antigos restauram o visual clássico em vez de herdar sobras). */
  showTopBar?: boolean;
  topBarBgColor?: string;
  headerBannerHtml?: string;
  headerBannerLinkUrl?: string;
  menuBarStyle?: "attached" | "bar";
  menuBarBgColor?: string;
  footerAccentColor?: string;
  /** Idioma/fuso do site público aplicados junto (ausente = settings intocadas).
   *  Permite que um starter EN (ex.: KSports) já configure o site em inglês. */
  siteLanguage?: "pt-BR" | "en";
  siteTimezone?: string;
}

/** Prefixos de id gerados pelo painel ao adicionar blocos ("<tipo>-<timestamp>"). */
const TYPE_PREFIXES: readonly string[] = [
  "content", "image", "carousel", "video", "advertising", "list", "ticker",
  "newsletter", "categories", "weather", "quotes", "social", "html", "table",
  "counter", "sep", "map", "embed",
];

/**
 * Tipo efetivo de um bloco. Ordem: campo persistido → prefixo do id (blocos
 * antigos criados pelo painel) → "content" (blocos pré-definidos e demais).
 */
export function inferBlockType(block: Pick<HomeBlock, "id" | "blockType" | "custom">): string {
  if (block.blockType) return block.blockType;
  if (!block.custom) return "content";
  const prefix = block.id.split("-")[0] ?? "";
  return TYPE_PREFIXES.includes(prefix) ? prefix : "content";
}

/** Formato inicial de cada tipo (mesma 1ª opção dos selects do painel). */
export function defaultFormatForType(type: string): string {
  switch (type) {
    case "image":       return "full_width_image";
    case "carousel":    return "carousel_news";
    case "video":       return "video_featured";
    case "advertising": return "banner_970x90";
    case "list":        return "list_compact";
    default:            return "grid";
  }
}

/**
 * Converte URL de vídeo (YouTube/Vimeo em qualquer forma, ou arquivo direto)
 * para a URL de embed. Retorna null se não reconhecer — nunca deixa passar
 * esquemas perigosos (javascript:, data:).
 */
export function parseVideoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^https:\/\/(www\.)?(youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/i.test(url)) {
    return url;
  }
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/))([\w-]{6,20})/i);
  if (yt?.[1]) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  if (vimeo?.[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (/^https?:\/\/[^\s]+\.(mp4|webm|ogg)(\?[^\s]*)?$/i.test(url)) return url;
  return null;
}

/** true quando a URL aponta para arquivo de vídeo direto (usar <video>, não iframe). */
export function isDirectVideoFile(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?[^\s]*)?$/i.test(url);
}

/** Aceita apenas URLs https absolutas para iframes (embed/mapa). */
export function safeEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

/** Item de um segmento: bloco + índice global na lista de visíveis (ads/cv-auto por posição). */
export interface SegmentEntry {
  block: HomeBlock;
  idx: number;
}

/** Segmento de renderização da home: fluxo clássico (1 bloco), zona de 2 colunas
 *  (principal + lateral) ou run de blocos de meia largura. */
export type HomeSegment =
  | { kind: "flow"; block: HomeBlock; idx: number }
  | { kind: "zone"; main: SegmentEntry[]; sidebar: SegmentEntry[]; startIdx: number }
  | { kind: "half"; items: SegmentEntry[]; startIdx: number };

/**
 * Agrupa os blocos visíveis em segmentos: runs consecutivos com `area` viram uma
 * zona de 2 colunas, runs de `width === "half"` viram pares; o resto continua no
 * fluxo clássico com o índice global preservado. Sem `area`/`width` em nenhum
 * bloco o resultado é 1 flow por bloco — o layout atual não muda. `area` vence
 * quando os dois campos estão definidos.
 */
export function segmentBlocks(visible: HomeBlock[]): HomeSegment[] {
  const segments: HomeSegment[] = [];
  let i = 0;
  while (i < visible.length) {
    const block = visible[i]!;
    if (block.area === "main" || block.area === "sidebar") {
      const main: SegmentEntry[] = [];
      const sidebar: SegmentEntry[] = [];
      const startIdx = i;
      while (i < visible.length && (visible[i]!.area === "main" || visible[i]!.area === "sidebar")) {
        const b = visible[i]!;
        (b.area === "sidebar" ? sidebar : main).push({ block: b, idx: i });
        i++;
      }
      segments.push({ kind: "zone", main, sidebar, startIdx });
      continue;
    }
    if (block.width === "half" || block.width === "quarter") {
      const items: SegmentEntry[] = [];
      const startIdx = i;
      while (i < visible.length
        && (visible[i]!.width === "half" || visible[i]!.width === "quarter")
        && !visible[i]!.area) {
        items.push({ block: visible[i]!, idx: i });
        i++;
      }
      segments.push({ kind: "half", items, startIdx });
      continue;
    }
    segments.push({ kind: "flow", block, idx: i });
    i++;
  }
  return segments;
}

/**
 * Amostra pseudo-aleatória de artigos para o PREVIEW do admin quando a
 * categoria do bloco ainda não tem notícias — mostra como o bloco ficará.
 * Determinística por `seed` (id do bloco): não pisca a cada re-render e cada
 * bloco exibe uma seleção diferente. Os itens saem com chapéu "EXEMPLO".
 * No site público o bloco vazio continua não renderizando nada.
 */
export function sampleForPreview<T extends { id: string; chapeu: string }>(
  all: T[], seed: string, limit: number,
): T[] {
  const hash = (s: string): number => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  };
  // Mistura não-linear (finalizer do murmur3): sem ela a seed viraria só um
  // deslocamento constante e a ordem seria a mesma para qualquer bloco.
  const seedHash = hash(seed);
  const mix = (id: string): number => {
    let h = seedHash ^ hash(id);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  };
  return [...all]
    .sort((a, b) => mix(a.id) - mix(b.id))
    .slice(0, limit)
    .map((a) => ({ ...a, chapeu: "EXEMPLO" }));
}

/** Links clicáveis (imagem/banner): http(s) ou caminho relativo do site. Nunca javascript:. */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}
