/**
 * Playlist do YouTube na home — SEM chave de API.
 *
 * O YouTube publica um feed Atom por playlist
 * (`/feeds/videos.xml?playlist_id=…`) com os ~15 vídeos mais recentes. É de
 * graça, não tem cota e não exige credencial nenhuma no `.env` do blog — o que
 * importa aqui, porque a imagem Docker é a mesma nos 8 blogs e cada um aponta
 * para a própria playlist pelo painel.
 *
 * As funções de parse são PURAS (testáveis sem rede); só `fetchPlaylist` toca a
 * internet, e com cache em memória para não bater no YouTube a cada pageview.
 */

export interface PlaylistVideo {
  id: string;
  title: string;
  /** Miniatura oficial, derivada do id (o feed nem sempre traz a tag). */
  thumb: string;
  publishedAt: string;
}

export interface PlaylistFeed {
  id: string;
  title: string;
  videos: PlaylistVideo[];
}

/** Máximo de itens devolvidos — o feed do YouTube já entrega ~15. */
export const PLAYLIST_MAX = 15;

/**
 * Extrai o id da playlist de qualquer forma que o operador cole: URL de
 * playlist, URL de vídeo dentro de uma playlist, ou o id cru. Devolve null
 * quando não reconhece (o bloco então mostra o aviso no painel).
 */
export function parsePlaylistId(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  // Id cru: PL…, UU… (uploads de um canal), FL…, RD…, OL… — sempre alfanumérico.
  if (/^[A-Za-z0-9_-]{12,64}$/.test(input) && !input.includes("/")) return input;
  const match = input.match(/[?&]list=([A-Za-z0-9_-]{12,64})/);
  return match?.[1] ?? null;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Entidades numéricas (o feed do YouTube manda acento como &#233;/&#xE9;).
    .replace(/&#(\d{1,7});/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]{1,6});/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    // &amp; por último: senão "&amp;#39;" viraria aspas em vez do texto literal.
    .replace(/&amp;/g, "&")
    .trim();
}

function firstTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m?.[1] ? decodeXmlText(m[1]) : "";
}

/**
 * Converte o feed Atom da playlist na lista exibida pelo bloco. Entrada sem
 * videoId é descartada (nunca vira card quebrado).
 */
export function parsePlaylistFeed(xml: string, playlistId: string): PlaylistFeed {
  const head = xml.split("<entry")[0] ?? "";
  const videos: PlaylistVideo[] = [];
  for (const chunk of xml.split("<entry").slice(1)) {
    const entry = chunk.split("</entry>")[0] ?? "";
    const id = firstTag(entry, "yt:videoId");
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) continue;
    videos.push({
      id,
      title: firstTag(entry, "title") || id,
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      publishedAt: firstTag(entry, "published"),
    });
    if (videos.length >= PLAYLIST_MAX) break;
  }
  return { id: playlistId, title: firstTag(head, "title"), videos };
}

// ─── Cache em memória ─────────────────────────────────────────────────────────
// A home é servida por SSR e o bloco aparece em toda visita: sem cache, cada
// pageview viraria uma requisição ao YouTube.
const TTL_MS = 30 * 60_000;
const _cache = new Map<string, { feed: PlaylistFeed; at: number }>();

export function clearPlaylistCache(): void {
  _cache.clear();
}

/** Busca (com cache) a playlist. Erro de rede devolve o cache velho, se houver. */
export async function fetchPlaylist(playlistId: string): Promise<PlaylistFeed | null> {
  const hit = _cache.get(playlistId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.feed;
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`,
      { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "NewsPortalBot/1.0" } },
    );
    if (!res.ok) return hit?.feed ?? null;
    const feed = parsePlaylistFeed(await res.text(), playlistId);
    if (feed.videos.length === 0) return hit?.feed ?? null;
    _cache.set(playlistId, { feed, at: Date.now() });
    return feed;
  } catch {
    return hit?.feed ?? null;
  }
}
