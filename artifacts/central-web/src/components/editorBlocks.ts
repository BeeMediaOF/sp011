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
 * uma tag que não está aqui nem no StarterKit, ela NÃO sobrevive. Quem cobra
 * isso é o round-trip de verdade em
 * `brasilia-agora/src/components/admin/editorBlocks.test.ts` — este arquivo é
 * cópia do de lá, então o teste vale para os dois.
 *
 * Cada bloco também ganha uma barra flutuante de Editar/Excluir (node view) —
 * sem ela um vídeo ou uma imagem só saía do texto na tecla Backspace, às cegas.
 * Espelhado em `brasilia-agora/src/components/admin/editorBlocks.ts`.
 */
import { Node, mergeAttributes } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode, DOMOutputSpec } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import Image, { type ImageOptions } from "@tiptap/extension-image";

/** Pedido de edição que a barra manda para o RichTextEditor abrir o modal. */
export interface BlockEditRequest {
  kind: "video" | "image";
  /** Posição do nó no documento — o modal salva de volta exatamente aqui. */
  pos: number;
  attrs: Record<string, unknown>;
  /** "galeria" quando a imagem é célula de uma galeria (não oferece alinhamento). */
  context: string | null;
}

export type OnBlockEdit = (req: BlockEditRequest) => void;

interface ToolOptions {
  /** Injetado pelo RichTextEditor; sem ele a barra mostra só "Excluir". */
  onEdit: OnBlockEdit | null;
}

/** Atributos copiados tal e qual do HTML para o nó e de volta. */
function passthrough(
  names: readonly string[],
  defaults: Record<string, string> = {},
): Record<string, { default: string | null }> {
  const attrs: Record<string, { default: string | null }> = {};
  for (const name of names) attrs[name] = { default: defaults[name] ?? null };
  return attrs;
}

/* ───────────────────────── barra flutuante ───────────────────────── */

function toolsRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "pm-block-tools";
  row.setAttribute("contenteditable", "false");
  return row;
}

function toolButton(row: HTMLElement, act: "edit" | "del", label: string, onClick: () => void): void {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.act = act;
  b.textContent = label;
  b.title = label;
  // mousedown seria um clique DENTRO do editor: sem isto o ProseMirror move o
  // cursor (e às vezes destrói este node view) antes do click chegar.
  b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  row.appendChild(b);
}

/**
 * Remove o nó em `pos`. Se ele for o único filho de um bloco do painel (a
 * última foto de uma galeria, o iframe dentro da moldura do vídeo), remove o
 * bloco inteiro — senão sobraria uma caixa vazia no texto.
 */
function removeNodeAt(editor: Editor, pos: number): void {
  const { doc } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return;
  let from = pos;
  let to = pos + node.nodeSize;
  const $pos = doc.resolve(pos);
  if ($pos.depth > 0 && $pos.parent.type.name === "blockDiv" && $pos.parent.childCount === 1) {
    from = $pos.before($pos.depth);
    to = from + $pos.parent.nodeSize;
  }
  editor.chain().focus().deleteRange({ from, to }).run();
}

/** Escreve/apaga atributos de um elemento a partir dos attrs do nó. */
function setAttrs(el: HTMLElement, pairs: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(pairs)) {
    if (value === null || value === undefined || value === false || value === "") el.removeAttribute(name);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
}

/** Nome do bloco do painel que contém `pos` (galeria, citacao, video…). */
function contextAt(editor: Editor, pos: number): string | null {
  const $pos = editor.state.doc.resolve(pos);
  if ($pos.depth > 0 && $pos.parent.type.name === "blockDiv") {
    const marca = $pos.parent.attrs.dataBlock;
    return marca ? String(marca) : null;
  }
  return null;
}

interface ViewParts {
  /** Elemento externo (posiciona a barra); é o `dom` do node view. */
  dom: HTMLElement;
  row: HTMLElement;
  /** Lê a posição atual do nó — muda conforme o texto acima é editado. */
  posOf: () => number | null;
}

function baseView(getPos: unknown): ViewParts {
  const dom = document.createElement("div");
  dom.className = "pm-block";
  const row = toolsRow();
  dom.appendChild(row);
  return {
    dom,
    row,
    posOf: () => {
      if (typeof getPos !== "function") return null;
      const p = (getPos as () => number | undefined)();
      return typeof p === "number" ? p : null;
    },
  };
}

/* ───────────────────────────── nós ───────────────────────────── */

/**
 * `<iframe>` de player (YouTube/Vimeo). É um átomo: o editor mostra o player e
 * o HTML salvo é exatamente o que o site renderiza — `lib/sanitize.ts` deixa
 * passar só os hosts de player, então um iframe de outro host morre na exibição.
 * A barra de Editar/Excluir fica na moldura (`blockDiv`) que envolve o player.
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
export const VideoEmbed = Node.create<ToolOptions>({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,
  priority: 50,

  addOptions() {
    return { onEdit: null };
  },

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

  addNodeView() {
    return ({ node, getPos, editor }): NodeView => {
      const { dom, row, posOf } = baseView(getPos);
      let atual = node as PMNode;

      const media = document.createElement("video");
      const sync = (n: PMNode) => setAttrs(media, {
        src: n.attrs.src, style: n.attrs.style, class: n.attrs.class,
        poster: n.attrs.poster, controls: n.attrs.controls ?? "",
        playsinline: n.attrs.playsinline, preload: n.attrs.preload,
      });
      sync(atual);
      dom.appendChild(media);

      const onEdit = this.options.onEdit;
      if (onEdit) {
        toolButton(row, "edit", "Editar", () => {
          const pos = posOf();
          if (pos !== null) onEdit({ kind: "video", pos, attrs: { ...atual.attrs }, context: null });
        });
      }
      toolButton(row, "del", "Excluir", () => {
        const pos = posOf();
        if (pos !== null) removeNodeAt(editor, pos);
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type !== atual.type) return false;
          atual = updated;
          sync(updated);
          return true;
        },
        stopEvent: (e) => row.contains(e.target as globalThis.Node),
        // A barra não é conteúdo, e o `sync` mexe em atributos: nem uma coisa
        // nem outra pode virar re-parse do documento.
        ignoreMutation: (m) => m.type === "attributes" || row.contains(m.target),
      };
    };
  },
});

/**
 * Contêiner dos blocos gerados pelo painel (galeria, citação, moldura do
 * vídeo). Só entra `div` MARCADA com `data-block` — `div` genérica continua
 * sendo achatada como antes, senão todo HTML colado de um site de fora traria
 * junto as divs e os estilos dele.
 */
export const BlockDiv = Node.create<ToolOptions>({
  name: "blockDiv",
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { onEdit: null };
  },

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

  addNodeView() {
    return ({ node, getPos, editor }): NodeView => {
      const { dom, row, posOf } = baseView(getPos);
      let atual = node as PMNode;

      // A div REAL do bloco é o contentDOM: assim a grade da galeria e a
      // moldura 16:9 do vídeo continuam valendo dentro do editor.
      const caixa = document.createElement("div");
      const sync = (n: PMNode) => setAttrs(caixa, {
        "data-block": n.attrs.dataBlock, style: n.attrs.style, class: n.attrs.class,
      });
      sync(atual);
      dom.appendChild(caixa);

      const onEdit = this.options.onEdit;
      // Só a moldura de vídeo tem o que editar em modal: o texto da citação se
      // edita no próprio corpo e as fotos da galeria têm barra individual.
      if (onEdit && node.attrs.dataBlock === "video") {
        toolButton(row, "edit", "Editar", () => {
          const pos = posOf();
          if (pos === null) return;
          const player = atual.firstChild;
          onEdit({ kind: "video", pos, attrs: { ...(player?.attrs ?? {}) }, context: "moldura" });
        });
      }
      toolButton(row, "del", "Excluir", () => {
        const pos = posOf();
        if (pos !== null) removeNodeAt(editor, pos);
      });

      return {
        dom,
        contentDOM: caixa,
        update: (updated) => {
          if (updated.type !== atual.type) return false;
          atual = updated;
          sync(updated);
          return true;
        },
        stopEvent: (e) => row.contains(e.target as globalThis.Node),
        // A barra não é conteúdo, e o `sync` mexe em atributos: nem uma coisa
        // nem outra pode virar re-parse do documento.
        ignoreMutation: (m) => m.type === "attributes" || row.contains(m.target),
      };
    };
  },
});

/**
 * `Image` do TipTap preserva só src/alt/title — o alinhamento das imagens no
 * texto e a grade da galeria vivem no `style`, que ia embora no round-trip.
 *
 * `href` existe pelo mesmo motivo: o `<a>` em volta da imagem (banner com link,
 * o formato dos anúncios) não é nó nenhum e sumia; agora ele é atributo da
 * imagem e volta no `renderHTML`.
 */
export const StyledImage = Image.extend<ImageOptions & ToolOptions>({
  addOptions() {
    return { ...this.parent?.(), onEdit: null };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      style: { default: null },
      class: { default: null },
      href: {
        default: null,
        // Só quando a imagem é o ÚNICO conteúdo do link — senão um link de
        // texto com ícone dentro carimbaria o href na imagem errada.
        parseHTML: (el) => {
          const pai = el.parentElement;
          const soImagem =
            pai?.tagName === "A" && pai.children.length === 1 && (pai.textContent ?? "").trim() === "";
          return soImagem ? pai.getAttribute("href") : null;
        },
        renderHTML: () => ({}),
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    // `href` sai do nó, não do HTMLAttributes: o `renderHTML` do atributo o
    // remove de lá justamente para ele não virar `href` DA IMAGEM.
    const href = node.attrs.href as string | null;
    const imagem: DOMOutputSpec = ["img", mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes)];
    if (!href) return imagem;
    return [
      "a",
      { href: String(href), target: "_blank", rel: "noopener noreferrer", style: "display:inline-block" },
      imagem,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }): NodeView => {
      const { dom, row, posOf } = baseView(getPos);
      let atual = node as PMNode;

      const img = document.createElement("img");
      const sync = (n: PMNode) => {
        setAttrs(img, {
          src: n.attrs.src, alt: n.attrs.alt, title: n.attrs.title,
          style: n.attrs.style, class: n.attrs.class,
        });
        // A moldura passa a ser quem flutua: imagem alinhada à esquerda/direita
        // dentro de um wrapper de bloco perderia o texto correndo ao lado.
        const flutua = /float:\s*(left|right)/i.exec(String(n.attrs.style ?? ""));
        dom.removeAttribute("style");
        if (flutua) {
          const lado = flutua[1].toLowerCase();
          dom.style.float = lado;
          dom.style.maxWidth = "48%";
          dom.style.margin = lado === "left" ? "0 18px 12px 0" : "0 0 12px 18px";
          img.style.float = "none";
          img.style.margin = "0";
          img.style.maxWidth = "100%";
        }
        // Sinaliza o banner clicável: no editor o <a> não é renderizado (ele
        // engoliria o clique), então o aviso fica na moldura.
        dom.classList.toggle("pm-block-linked", Boolean(n.attrs.href));
      };
      sync(atual);
      dom.appendChild(img);

      const onEdit = this.options.onEdit;
      if (onEdit) {
        toolButton(row, "edit", "Editar", () => {
          const pos = posOf();
          if (pos !== null) {
            onEdit({ kind: "image", pos, attrs: { ...atual.attrs }, context: contextAt(editor, pos) });
          }
        });
      }
      toolButton(row, "del", "Excluir", () => {
        const pos = posOf();
        if (pos !== null) removeNodeAt(editor, pos);
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type !== atual.type) return false;
          atual = updated;
          sync(updated);
          return true;
        },
        stopEvent: (e) => row.contains(e.target as globalThis.Node),
        // A barra não é conteúdo, e o `sync` mexe em atributos: nem uma coisa
        // nem outra pode virar re-parse do documento.
        ignoreMutation: (m) => m.type === "attributes" || row.contains(m.target),
      };
    };
  },
});
