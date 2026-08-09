/**
 * Nós do TipTap para os blocos que o painel injeta no corpo do artigo.
 *
 * POR QUE ISTO EXISTE: o corpo do artigo é editado pelo ProseMirror, que
 * DESCARTA em silêncio toda tag sem nó correspondente no schema. Os botões
 * "Adicionar vídeo/galeria/citação" gravam HTML cru em `form.content`; o
 * RichTextEditor reabre esse HTML com `setContent`, e sem os nós abaixo o
 * `<iframe>`/`<video>` simplesmente sumia do editor (e do artigo salvo assim
 * que o autor digitasse qualquer coisa depois de inserir).
 *
 * Regra ao criar um bloco novo: se o HTML gerado em `lib/articleEmbeds.ts` usa
 * uma tag que não está aqui nem no StarterKit, ela NÃO sobrevive.
 * Espelhado em `brasilia-agora/src/components/admin/editorBlocks.ts`.
 */
import { Node, mergeAttributes } from "@tiptap/react";
import Image from "@tiptap/extension-image";

/** Atributos copiados tal e qual do HTML para o nó e de volta. */
function passthrough(
  names: readonly string[],
  defaults: Record<string, string> = {},
): Record<string, { default: string | null }> {
  const attrs: Record<string, { default: string | null }> = {};
  for (const name of names) attrs[name] = { default: defaults[name] ?? null };
  return attrs;
}

/**
 * `<iframe>` de player (YouTube/Vimeo). É um átomo: o editor mostra o player e
 * o HTML salvo é exatamente o que o blog renderiza — o sanitizador do ingest
 * deixa passar só os hosts de player, então iframe de outro host morre lá.
 *
 * `priority` abaixo do padrão (100) faz as regras do `@tiptap/extension-youtube`
 * serem avaliadas ANTES desta; o `getAttrs` é a segunda trava, para o iframe
 * dentro do wrapper `div[data-youtube-video]` continuar sendo dele.
 */
export const IframeEmbed = Node.create({
  name: "iframeEmbed",
  group: "block",
  atom: true,
  draggable: true,
  priority: 50,

  addAttributes() {
    return passthrough(
      ["src", "style", "class", "width", "height", "title", "loading",
       "allow", "referrerpolicy", "frameborder", "allowfullscreen"],
      { frameborder: "0", allowfullscreen: "" },
    );
  },

  parseHTML() {
    return [{
      tag: "iframe",
      getAttrs: (el) =>
        typeof el !== "string" && el.parentElement?.hasAttribute("data-youtube-video")
          ? false
          : null,
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["iframe", mergeAttributes(HTMLAttributes)];
  },
});

/** `<video>` de arquivo próprio (upload de MP4/WebM pela barra do editor). */
export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  priority: 50,

  addAttributes() {
    return passthrough(
      ["src", "style", "class", "poster", "width", "height", "preload", "controls", "playsinline"],
      { controls: "" },
    );
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes)];
  },
});

/**
 * Contêiner dos blocos gerados pelo painel (galeria, citação, moldura do
 * vídeo). Só entra `div` MARCADA com `data-block` — `div` genérica continua
 * sendo achatada como antes, senão todo HTML colado de um site de fora traria
 * junto as divs e os estilos dele.
 */
export const BlockDiv = Node.create({
  name: "blockDiv",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      dataBlock: {
        default: "html",
        parseHTML: (el) => el.getAttribute("data-block"),
        renderHTML: (attrs) =>
          attrs.dataBlock ? { "data-block": String(attrs.dataBlock) } : {},
      },
      style: { default: null },
      class: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * `Image` do TipTap preserva só src/alt/title — o alinhamento das imagens no
 * texto e a grade da galeria vivem no `style`, que ia embora no round-trip.
 */
export const StyledImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: { default: null },
      class: { default: null },
    };
  },
});
