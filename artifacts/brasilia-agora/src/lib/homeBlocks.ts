/**
 * Modelo compartilhado dos blocos da home + helpers puros.
 *
 * O tipo do bloco (imagem, carrossel, vídeo…) é persistido em `blockType`.
 * Blocos criados por versões antigas do painel não têm o campo — o tipo é
 * inferido do prefixo do id ("image-1719848…" → "image") por inferBlockType().
 */

export type HomeBlockLayout =
  | "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete"
  | "mosaico" | "trio" | "compact" | "bigstory" | "timeline";

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

/** Links clicáveis (imagem/banner): http(s) ou caminho relativo do site. Nunca javascript:. */
export function safeLinkUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}
