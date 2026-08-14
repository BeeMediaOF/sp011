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
  | "overlay" | "magazine" | "mini" | "hero";

export type HomeBlockType =
  | "content" | "image" | "carousel" | "video" | "advertising" | "list"
  | "ticker" | "newsletter" | "categories" | "quotes" | "social"
  | "html" | "embed" | "map" | "sep" | "weather" | "table" | "counter"
  | "search" | "playlist";

/** Ajuste de UMA editoria dentro do bloco "Categorias". */
export interface CategoryBlockItem {
  slug: string;
  /** Rótulo próprio (vazio = o nome cadastrado da categoria). */
  label?: string;
  /** Imagem enviada no painel (vazio = ícone padrão do slug). */
  imageUrl?: string;
  /** Não exibir esta editoria no bloco. */
  hidden?: boolean;
}

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
  /** Dimensões nativas da imagem, preenchidas pelo /api/site (não editáveis no
   *  painel). Servem para o `<img>` reservar a caixa e não deslocar o layout
   *  quando a imagem chega — ver api-server/src/lib/blockImageMeta.ts. */
  imageWidth?: number;
  imageHeight?: number;
  /** Link de destino ao clicar (imagem/banner). */
  linkUrl?: string;
  /** Legenda da imagem ou texto auxiliar (ex.: chamada da newsletter). */
  caption?: string;
  /** Bloco de vídeo: URL do YouTube/Vimeo ou arquivo .mp4/.webm. */
  videoUrl?: string;
  /** Bloco de playlist: URL ou id da playlist do YouTube (a lista de vídeos é
   *  lida do feed público pelo api-server — não precisa de chave de API). */
  playlistUrl?: string;
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
  /** Rótulo do botão do bloco de newsletter (padrão: i18n "Assinar"). */
  buttonLabel?: string;
  /** Cabeçalho de seção estilo "revista" (título grande + link colorido, sem
   *  barra/uppercase). Os layouts "mini" e "hero" já usam revista por padrão. */
  sectionStyle?: "revista";
  /** Esconde o cabeçalho da seção (título + "Ver mais") — o "modo hero" de
   *  qualquer bloco. O `name` continua existindo: é o identificador do bloco na
   *  lista do painel e nos templates, então esvaziá-lo não é alternativa. */
  hideHeader?: boolean;
  /** Bloco de imagem/HTML marcado como propaganda — listado na aba Propagandas do admin. */
  isAd?: boolean;
  /** Bloco "categories": ajustes por editoria (imagem própria, rótulo, ocultar).
   *  Ausente = todas as categorias do blog com o ícone padrão do slug. */
  categoryItems?: CategoryBlockItem[];
  /** Fonte do texto do bloco: id do registro em lib/fonts.ts. Ausente = padrão do site. */
  fontFamily?: string;
  /** Em que telas o bloco aparece (ausente/"all" = todas). O corte é o mesmo
   *  breakpoint do menu (1024px) e é feito por CSS — ver .block-only-* no
   *  index.css. Serve para propaganda exclusiva de mobile/desktop. */
  devices?: "all" | "mobile" | "desktop";
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
  footerStyle?: "dark" | "light" | "minimal" | "portal";
  headerBgColor?: string;
  footerBgColor?: string;
  menuTextColor?: string;
  menuActiveColor?: string;
  menuFontSize?: number;
  menuFontWeight?: number;
  headerPaddingX?: number;
  headerMarginTop?: number;
  /** Espaço abaixo do cabeçalho (campo "portal": reset neutro ao aplicar). */
  headerMarginBottom?: number;
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
  /** Fundo da página da home (vazio = branco). Campo "portal": reset neutro. */
  pageBgColor?: string;
  /** Idioma/fuso do site público aplicados junto (ausente = settings intocadas).
   *  Permite que um starter EN (ex.: KSports) já configure o site em inglês. */
  siteLanguage?: "pt-BR" | "en";
  siteTimezone?: string;
}

/** Prefixos de id gerados pelo painel ao adicionar blocos ("<tipo>-<timestamp>"). */
const TYPE_PREFIXES: readonly string[] = [
  "content", "image", "carousel", "video", "advertising", "list", "ticker",
  "newsletter", "categories", "weather", "quotes", "social", "html", "table",
  "counter", "sep", "map", "embed", "search", "playlist",
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
    case "playlist":    return "playlist_player";
    case "advertising": return "banner_970x90";
    case "list":        return "list_compact";
    case "search":      return "search_bar";
    case "categories":  return "cards";
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

/**
 * Id da playlist do YouTube a partir do que o operador colar: id cru, URL de
 * playlist ou URL de vídeo dentro dela. Espelha `parsePlaylistId` do api-server
 * (lib/youtubePlaylist.ts) — mudar aqui exige mudar lá.
 */
export function parsePlaylistId(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  if (/^[A-Za-z0-9_-]{12,64}$/.test(input) && !input.includes("/")) return input;
  const match = input.match(/[?&]list=([A-Za-z0-9_-]{12,64})/);
  return match?.[1] ?? null;
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

// ─── Bloco "Categorias" ──────────────────────────────────────────────────────

/** De onde o bloco de editorias tira a lista. */
export type CategoriesSource = "categories" | "menu" | "html";

/**
 * Origem do bloco. O padrão é `categories` (as editorias cadastradas em
 * painel → Categorias): blocos antigos carregam `source: "automatic_by_category"`,
 * herdado do formulário, e caem no padrão. `menu` reproduz o comportamento
 * histórico (itens do menu) e `html` entrega o markup livre do operador.
 */
export function categoriesBlockSource(block: Pick<HomeBlock, "source">): CategoriesSource {
  return block.source === "menu" || block.source === "html" ? block.source : "categories";
}

export interface ResolvedCategoryItem {
  slug: string;
  label: string;
  href: string;
  /** Imagem enviada no painel; ausente = desenhar o `icon`. */
  imageUrl?: string;
  /** Emoji do slug ou as iniciais do rótulo (ver lib/categoryIcons.ts). */
  icon: string;
}

export interface CategorySourceEntry { slug: string; name: string; visible?: boolean }
export interface MenuSourceEntry { label: string; path: string; visible?: boolean }

/**
 * Lista final de editorias do bloco: base (categorias do blog ou itens do
 * menu) + ajustes de `categoryItems` (rótulo, imagem, ocultar).
 *
 * Um blog que nunca salvou Categorias cai no menu — sem isso o bloco sumiria
 * da home justamente nos blogs recém-instalados. Ajuste de slug que não existe
 * mais na base é ignorado (categoria apagada não volta pelo bloco).
 *
 * NÃO corta por `itemsLimit` (2026-08-14): o painel do bloco Categorias nunca
 * teve campo de quantidade, mas o formulário gravava `itemsLimit: 4` em TODO
 * bloco salvo — bastava abrir o bloco uma vez para a home passar a exibir 4
 * editorias, sem controle nenhum na tela para desfazer. Quem quer menos usa o
 * olho (`hidden`) de cada editoria, que já existe no CategoryItemsEditor.
 */
export function resolveCategoryBlockItems(
  block: Pick<HomeBlock, "source" | "categoryItems">,
  categories: readonly CategorySourceEntry[] | undefined,
  menuItems: readonly MenuSourceEntry[] | undefined,
  iconOf: (slug: string, label: string) => string,
): ResolvedCategoryItem[] {
  const fromCategories = (categories ?? [])
    .filter((c) => c.visible !== false && (c.slug ?? "").trim() !== "")
    .map((c) => ({ slug: c.slug.trim(), label: (c.name ?? "").trim() || c.slug.trim() }));

  const fromMenu = (menuItems ?? [])
    .filter((m) => m.visible !== false && (m.path ?? "").startsWith("/") && m.path !== "/")
    .map((m) => ({ slug: m.path.replace(/^\//, "").replace(/\/+$/, ""), label: (m.label ?? "").trim() }))
    .filter((m) => m.slug !== "" && !m.slug.includes("/"));

  const useMenu = categoriesBlockSource(block) === "menu" || fromCategories.length === 0;
  const base = useMenu ? fromMenu : fromCategories;

  const overrides = new Map((block.categoryItems ?? []).map((i) => [i.slug, i]));
  const seen = new Set<string>();
  const out: ResolvedCategoryItem[] = [];
  for (const entry of base) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    const ov = overrides.get(entry.slug);
    if (ov?.hidden) continue;
    const label = (ov?.label ?? "").trim() || entry.label || entry.slug;
    const imageUrl = (ov?.imageUrl ?? "").trim();
    out.push({
      slug: entry.slug,
      label,
      href: `/${entry.slug}`,
      ...(imageUrl ? { imageUrl } : {}),
      icon: iconOf(entry.slug, label),
    });
  }
  return out;
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
