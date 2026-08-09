/**
 * HTML dos blocos que o painel injeta no corpo do artigo (vídeo, galeria,
 * citação, imagem no texto).
 *
 * DUAS RESTRIÇÕES governam este arquivo — quebrar qualquer uma faz o bloco
 * sumir sem erro nenhum:
 *
 * 1. O corpo é editado pelo TipTap. Toda tag usada aqui precisa de um nó em
 *    `components/editorBlocks.ts`; o que o schema não conhece o ProseMirror
 *    descarta ao reabrir o conteúdo.
 * 2. O artigo publicado aqui vai para os blogs pelo ingest, cujo sanitizador
 *    canônico (`@workspace/news-engine/sanitize`) APAGA todo `style` inline.
 *    Por isso os blocos também levam `class` e o layout tem fallback em CSS
 *    (`.video-embed`, no index.css do blog e no styles.css daqui) — o style
 *    inline é só conveniência.
 *
 * Espelhado em `brasilia-agora/src/lib/articleEmbeds.ts`.
 */

/** Escapa um valor para dentro do texto do HTML. */
function escText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapa um valor para dentro de atributo HTML entre aspas duplas. */
function attr(value: string): string {
  return escText(value).replace(/"/g, "&quot;");
}

/** Id de 11 caracteres de um link do YouTube (watch, youtu.be ou embed). */
export function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/** Id numérico de um link do Vimeo. */
export function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m?.[1] ?? null;
}

const PLAYER_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/** Moldura 16:9 do player: mantém a proporção sem depender de JS. */
const FRAME_STYLE = "position:relative;padding-bottom:56.25%;height:0;margin:20px 0;";
const PLAYER_STYLE =
  "position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:10px;";

function playerFrame(src: string, title: string): string {
  return (
    `<div data-block="video" class="video-embed" style="${FRAME_STYLE}">` +
    `<iframe src="${attr(src)}" title="${attr(title)}" loading="lazy" frameborder="0"` +
    ` allow="${PLAYER_ALLOW}" allowfullscreen style="${PLAYER_STYLE}"></iframe>` +
    `</div>`
  );
}

/**
 * Bloco de vídeo a partir de um link colado. YouTube e Vimeo viram player
 * incorporado (os únicos hosts que a sanitização de exibição deixa passar);
 * qualquer outra URL vira `<video>` de arquivo.
 * Devolve "" para entrada vazia.
 */
export function buildVideoEmbed(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) return "";

  const ytId = getYoutubeId(url);
  if (ytId) return playerFrame(`https://www.youtube.com/embed/${ytId}`, "Vídeo do YouTube");

  const vimeoId = getVimeoId(url);
  if (vimeoId) return playerFrame(`https://player.vimeo.com/video/${vimeoId}`, "Vídeo do Vimeo");

  return (
    `<video class="video-embed-file" src="${attr(url)}" controls playsinline` +
    ` style="width:100%;border-radius:10px;margin:20px 0;display:block;"></video>`
  );
}

/** Galeria em grade. Ignora campos vazios; devolve "" se não sobrar imagem. */
export function buildGalleryBlock(urls: readonly string[]): string {
  const valid = urls.map((u) => u.trim()).filter(Boolean);
  if (!valid.length) return "";
  const imgs = valid
    .map(
      (u) =>
        `<img src="${attr(u)}" alt="" style="width:100%;height:200px;object-fit:cover;border-radius:8px;" />`,
    )
    .join("");
  return (
    `<div data-block="galeria" class="article-gallery"` +
    ` style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:20px 0;">` +
    `${imgs}</div>`
  );
}

/**
 * Citação em destaque. O itálico e o negrito vão como marcas (`<em>`/`<strong>`)
 * porque `style` de parágrafo não sobrevive ao editor — a caixa colorida é do
 * `div`, que sobrevive. Devolve "" para texto vazio.
 */
export function buildCitationBlock(text: string, author: string): string {
  const quote = text.trim();
  if (!quote) return "";
  const who = author.trim();
  const footer = who ? `<p><strong>&mdash; ${escText(who)}</strong></p>` : "";
  return (
    `<div data-block="citacao" class="article-quote"` +
    ` style="border-left:4px solid #0B2A66;padding:14px 18px;margin:20px 0;background:#EEF2FF;border-radius:0 10px 10px 0;color:#1e3a8a;">` +
    `<p><em>&ldquo;${escText(quote)}&rdquo;</em></p>${footer}</div>`
  );
}

export type InlineImageAlign = "center" | "left" | "right";

const INLINE_IMAGE_STYLE: Record<InlineImageAlign, string> = {
  center: "display:block;margin:20px auto;max-width:100%;border-radius:8px;",
  left: "float:left;margin:0 18px 12px 0;max-width:48%;border-radius:8px;",
  right: "float:right;margin:0 0 12px 18px;max-width:48%;border-radius:8px;",
};

/** Imagem solta no corpo do texto, com alinhamento. Devolve "" sem URL. */
export function buildInlineImage(rawUrl: string, alt: string, align: InlineImageAlign): string {
  const url = rawUrl.trim();
  if (!url) return "";
  return `<img src="${attr(url)}" alt="${attr(alt.trim())}" style="${INLINE_IMAGE_STYLE[align]}" />`;
}
