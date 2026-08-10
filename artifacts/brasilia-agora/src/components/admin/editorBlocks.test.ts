/**
 * Round-trip REAL do corpo do artigo: o HTML que o painel injeta passa pelo
 * mesmo parse/serialize do ProseMirror que o editor usa em `setContent`.
 *
 * É o teste que faltava quando o vídeo sumiu: os construtores de
 * `lib/articleEmbeds.ts` estavam certos e o bloco continuava desaparecendo,
 * porque o schema do editor descartava a tag em silêncio. Aqui a garantia é do
 * par (HTML gerado + nó no schema) — se alguém criar um bloco novo com uma tag
 * sem nó em `editorBlocks.ts`, este teste cai.
 *
 * O jsdom existe só para isto: ProseMirror precisa de DOM de verdade.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.DocumentFragment = dom.window.DocumentFragment;
g.getComputedStyle = dom.window.getComputedStyle;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

// Importes dinâmicos: os módulos do TipTap tocam `document` ao carregar.
const { getSchema } = await import("@tiptap/react");
const { DOMParser, DOMSerializer } = await import("@tiptap/pm/model");
const StarterKit = (await import("@tiptap/starter-kit")).default;
const Link = (await import("@tiptap/extension-link")).default;
const Placeholder = (await import("@tiptap/extension-placeholder")).default;
const Youtube = (await import("@tiptap/extension-youtube")).default;
const { IframeEmbed, VideoEmbed, BlockDiv, StyledImage } = await import("./editorBlocks.ts");
const { buildVideoEmbed, buildGalleryBlock, buildCitationBlock, buildInlineImage } =
  await import("../../lib/articleEmbeds.ts");

/** MESMA lista do RichTextEditor.tsx — divergir aqui invalida o teste. */
const schema = getSchema([
  StarterKit.configure({ codeBlock: { languageClassPrefix: "language-" } }),
  StyledImage.configure({ inline: false, allowBase64: true }),
  Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
  Placeholder.configure({ placeholder: "x" }),
  Youtube.configure({ width: 720, height: 405 }),
  IframeEmbed,
  VideoEmbed,
  BlockDiv,
] as never);

/** Equivalente a `editor.commands.setContent(html)` + `editor.getHTML()`. */
function roundtrip(html: string): string {
  const container = dom.window.document.createElement("div");
  container.innerHTML = html;
  const doc = DOMParser.fromSchema(schema).parse(container);
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
    document: dom.window.document,
  });
  const out = dom.window.document.createElement("div");
  out.appendChild(frag as never);
  return out.innerHTML;
}

test("player do YouTube sobrevive ao editor (era o bug do video sumindo)", () => {
  const saida = roundtrip("<p>texto</p>" + buildVideoEmbed("https://youtu.be/dQw4w9WgXcQ?si=abc"));
  assert.ok(saida.includes("<p>texto</p>"), saida);
  assert.ok(saida.includes('src="https://www.youtube.com/embed/dQw4w9WgXcQ"'), saida);
  assert.ok(saida.includes('data-block="video"'), saida);
  assert.ok(saida.includes("video-embed"), `perdeu a classe do layout: ${saida}`);
});

test("video de arquivo (upload MP4) sobrevive ao editor", () => {
  const saida = roundtrip(buildVideoEmbed("https://cdn.exemplo.com/clipe.mp4"));
  assert.ok(saida.includes("<video"), saida);
  assert.ok(saida.includes('src="https://cdn.exemplo.com/clipe.mp4"'), saida);
  assert.ok(saida.includes("controls"), saida);
});

test("galeria mantem as imagens e o estilo de cada uma", () => {
  const saida = roundtrip(buildGalleryBlock(["https://x/1.jpg", "https://x/2.jpg"]));
  assert.equal(saida.match(/<img/g)?.length, 2, saida);
  assert.ok(saida.includes('data-block="galeria"'), saida);
  assert.ok(saida.includes("object-fit"), `imagem perdeu o style: ${saida}`);
});

test("citacao mantem a caixa e as marcas", () => {
  const saida = roundtrip(buildCitationBlock("O jogo virou", "Tecnico"));
  assert.ok(saida.includes('data-block="citacao"'), saida);
  assert.ok(saida.includes("<em>"), saida);
  assert.ok(saida.includes("<strong>"), saida);
});

test("imagem no texto mantem o alinhamento", () => {
  const saida = roundtrip("<p>a</p>" + buildInlineImage("https://x/a.jpg", "foto", "left"));
  assert.ok(/float:\s*left/.test(saida), `perdeu o float: ${saida}`);
  assert.ok(saida.includes('alt="foto"'), saida);
});

test("div SEM data-block continua sendo achatada (HTML colado de fora)", () => {
  const saida = roundtrip('<div class="do-outro-site" style="background:#f00"><p>texto</p></div>');
  assert.ok(saida.includes("<p>texto</p>"), saida);
  assert.ok(!saida.includes("do-outro-site"), `arrastou a div de fora: ${saida}`);
});

test("embed do proprio @tiptap/extension-youtube continua sendo dele", () => {
  const saida = roundtrip(
    '<div data-youtube-video=""><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>',
  );
  assert.ok(saida.includes("data-youtube-video"), `iframeEmbed roubou o no do Youtube: ${saida}`);
});
