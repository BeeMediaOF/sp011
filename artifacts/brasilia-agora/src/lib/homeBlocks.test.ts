/**
 * Testes dos helpers dos blocos da home (fluxo crítico do painel admin):
 * inferência de tipo (retrocompat com blocos antigos), URLs de vídeo/embed
 * seguras e formatos padrão. Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferBlockType, defaultFormatForType, parseVideoEmbedUrl,
  isDirectVideoFile, safeEmbedUrl, safeLinkUrl, segmentBlocks, sampleForPreview,
  categoriesBlockSource, resolveCategoryBlockItems, parsePlaylistId, categoryHref,
  type HomeBlock,
} from "./homeBlocks";
import { blogCategorySurface } from "./categoryRoutes";

test("inferBlockType: campo persistido tem prioridade", () => {
  assert.equal(inferBlockType({ id: "carousel-123", blockType: "image", custom: true }), "image");
});

test("inferBlockType: blocos antigos caem no prefixo do id", () => {
  assert.equal(inferBlockType({ id: "image-1719848000000", custom: true }), "image");
  assert.equal(inferBlockType({ id: "video-42", custom: true }), "video");
  assert.equal(inferBlockType({ id: "newsletter-9", custom: true }), "newsletter");
});

test("inferBlockType: duplicados e pré-definidos são conteúdo", () => {
  // Duplicata de bloco de imagem mantém o prefixo original
  assert.equal(inferBlockType({ id: "image-123-copy-456", custom: true }), "image");
  // Duplicata de bloco editorial (brasil) não vira tipo especial
  assert.equal(inferBlockType({ id: "brasil-copy-456", custom: true }), "content");
  // Blocos pré-definidos (não-custom) são sempre conteúdo
  assert.equal(inferBlockType({ id: "esporte", custom: false }), "content");
  assert.equal(inferBlockType({ id: "hero" }), "content");
});

test("defaultFormatForType: cada tipo tem formato inicial coerente", () => {
  assert.equal(defaultFormatForType("image"), "full_width_image");
  assert.equal(defaultFormatForType("carousel"), "carousel_news");
  assert.equal(defaultFormatForType("content"), "grid");
});

test("parseVideoEmbedUrl: aceita YouTube/Vimeo em várias formas", () => {
  assert.equal(parseVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(parseVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(parseVideoEmbedUrl("https://www.youtube.com/shorts/abc123XYZ_-"),
    "https://www.youtube.com/embed/abc123XYZ_-");
  assert.equal(parseVideoEmbedUrl("https://vimeo.com/123456789"),
    "https://player.vimeo.com/video/123456789");
  // Embed pronto passa direto
  assert.equal(parseVideoEmbedUrl("https://www.youtube.com/embed/xyz"),
    "https://www.youtube.com/embed/xyz");
  // Arquivo direto
  assert.equal(parseVideoEmbedUrl("https://cdn.site.com/v/clip.mp4"),
    "https://cdn.site.com/v/clip.mp4");
});

test("parseVideoEmbedUrl: rejeita URLs perigosas ou desconhecidas", () => {
  assert.equal(parseVideoEmbedUrl("javascript:alert(1)"), null);
  assert.equal(parseVideoEmbedUrl("https://example.com/pagina"), null);
  assert.equal(parseVideoEmbedUrl(""), null);
  assert.equal(parseVideoEmbedUrl(undefined), null);
});

test("isDirectVideoFile: distingue arquivo de embed", () => {
  assert.equal(isDirectVideoFile("https://cdn.x.com/a.mp4"), true);
  assert.equal(isDirectVideoFile("https://www.youtube.com/embed/xyz"), false);
});

test("safeEmbedUrl: apenas https absoluto", () => {
  assert.equal(safeEmbedUrl("https://www.google.com/maps/embed?pb=abc"),
    "https://www.google.com/maps/embed?pb=abc");
  assert.equal(safeEmbedUrl("http://inseguro.com"), null);
  assert.equal(safeEmbedUrl("javascript:alert(1)"), null);
  assert.equal(safeEmbedUrl(""), null);
});

test("safeLinkUrl: http(s) e caminhos relativos, nunca javascript:", () => {
  assert.equal(safeLinkUrl("https://x.com/a"), "https://x.com/a");
  assert.equal(safeLinkUrl("/artigo/slug"), "/artigo/slug");
  assert.equal(safeLinkUrl("//evil.com"), null);
  assert.equal(safeLinkUrl("javascript:alert(1)"), null);
  assert.equal(safeLinkUrl(undefined), null);
});

// ─── segmentBlocks (zonas da home) ───────────────────────────────────────────
function blk(id: string, extra: Partial<HomeBlock> = {}): HomeBlock {
  return { id, name: id, visible: true, order: 0, ...extra };
}

test("segmentBlocks: sem area/width → um flow por bloco com idx da posição (retrocompat)", () => {
  const segs = segmentBlocks([blk("hero"), blk("brasil"), blk("mundo"), blk("ultimas")]);
  assert.equal(segs.length, 4);
  segs.forEach((s, i) => {
    assert.equal(s.kind, "flow");
    if (s.kind === "flow") {
      assert.equal(s.idx, i);
    }
  });
});

test("segmentBlocks: run com area vira uma única zona main/sidebar", () => {
  const segs = segmentBlocks([
    blk("hero", { area: "main" }),
    blk("ticker", { area: "main" }),
    blk("mais-lidas", { area: "sidebar" }),
    blk("recent", { area: "main" }),
  ]);
  assert.equal(segs.length, 1);
  const zone = segs[0]!;
  assert.equal(zone.kind, "zone");
  if (zone.kind === "zone") {
    assert.deepEqual(zone.main.map((e) => e.block.id), ["hero", "ticker", "recent"]);
    assert.deepEqual(zone.sidebar.map((e) => e.block.id), ["mais-lidas"]);
    assert.deepEqual(zone.main.map((e) => e.idx), [0, 1, 3]);
    assert.equal(zone.startIdx, 0);
  }
});

test("segmentBlocks: run half vira segmento e o flow seguinte preserva o idx global", () => {
  const segs = segmentBlocks([
    blk("hero"),
    blk("football", { width: "half" }),
    blk("basketball", { width: "half" }),
    blk("ultimas"),
  ]);
  assert.equal(segs.length, 3);
  assert.equal(segs[0]!.kind, "flow");
  const half = segs[1]!;
  assert.equal(half.kind, "half");
  if (half.kind === "half") {
    assert.deepEqual(half.items.map((e) => e.idx), [1, 2]);
    assert.equal(half.startIdx, 1);
  }
  const tail = segs[2]!;
  assert.equal(tail.kind, "flow");
  if (tail.kind === "flow") {
    assert.equal(tail.idx, 3);
  }
});

test("segmentBlocks: area vence width quando os dois estão definidos", () => {
  const segs = segmentBlocks([
    blk("a", { area: "main", width: "half" }),
    blk("b", { width: "half" }),
  ]);
  assert.equal(segs.length, 2);
  assert.equal(segs[0]!.kind, "zone");
  assert.equal(segs[1]!.kind, "half");
});

test("segmentBlocks: width full explícito continua no fluxo clássico", () => {
  const segs = segmentBlocks([blk("a", { width: "full" }), blk("b", { width: "half" })]);
  assert.equal(segs[0]!.kind, "flow");
  assert.equal(segs[1]!.kind, "half");
});

test("sampleForPreview: determinística por seed, com limite e chapéu EXEMPLO", () => {
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, chapeu: "ESPORTES" }));
  const s1 = sampleForPreview(pool, "bloco-1", 4);
  const s2 = sampleForPreview(pool, "bloco-1", 4);
  const s3 = sampleForPreview(pool, "bloco-2", 4);
  assert.equal(s1.length, 4);
  assert.deepEqual(s1.map((a) => a.id), s2.map((a) => a.id));          // estável
  assert.notDeepEqual(s1.map((a) => a.id), s3.map((a) => a.id));       // varia por bloco
  assert.ok(s1.every((a) => a.chapeu === "EXEMPLO"));
  assert.deepEqual(sampleForPreview([], "x", 4), []);                   // pool vazio
});

// ─── Bloco "Categorias" ──────────────────────────────────────────────────────

const CATS = [
  { slug: "negocios", name: "Negócios" },
  { slug: "economia", name: "Economia" },
  { slug: "aviacao", name: "Aviação", visible: true },
  { slug: "oculta", name: "Oculta", visible: false },
];
const MENU = [
  { label: "HOME", path: "/" },
  { label: "TURISMO", path: "/turismo" },
  { label: "Externo", path: "https://exemplo.com" },
];
const icon = (slug: string) => `i:${slug}`;

test("categoriesBlockSource: só menu/html saem do padrão", () => {
  assert.equal(categoriesBlockSource({}), "categories");
  assert.equal(categoriesBlockSource({ source: "automatic_by_category" }), "categories");
  assert.equal(categoriesBlockSource({ source: "menu" }), "menu");
  assert.equal(categoriesBlockSource({ source: "html" }), "html");
});

test("resolveCategoryBlockItems: categorias do blog, sem as invisíveis", () => {
  const out = resolveCategoryBlockItems({}, CATS, MENU, icon);
  assert.deepEqual(out.map((c) => c.slug), ["negocios", "economia", "aviacao"]);
  assert.equal(out[0]!.href, "/negocios");
  assert.equal(out[0]!.label, "Negócios");
  assert.equal(out[0]!.icon, "i:negocios");
  assert.equal(out[0]!.imageUrl, undefined);
});

test("resolveCategoryBlockItems: blog sem categorias salvas cai no menu", () => {
  const out = resolveCategoryBlockItems({}, [], MENU, icon);
  // "/" e link externo não são editoria
  assert.deepEqual(out.map((c) => c.slug), ["turismo"]);
  assert.equal(out[0]!.label, "TURISMO");
});

test("resolveCategoryBlockItems: origem menu ignora as categorias", () => {
  const out = resolveCategoryBlockItems({ source: "menu" }, CATS, MENU, icon);
  assert.deepEqual(out.map((c) => c.slug), ["turismo"]);
});

test("resolveCategoryBlockItems: ajustes por editoria (imagem, rótulo, ocultar)", () => {
  const out = resolveCategoryBlockItems({
    categoryItems: [
      { slug: "negocios", imageUrl: "/api/uploads/x.jpg" },
      { slug: "economia", label: "Mercado" },
      { slug: "aviacao", hidden: true },
      { slug: "inexistente", imageUrl: "/api/uploads/y.jpg" },
    ],
  }, CATS, MENU, icon);
  assert.deepEqual(out.map((c) => c.slug), ["negocios", "economia"]);
  assert.equal(out[0]!.imageUrl, "/api/uploads/x.jpg");
  assert.equal(out[1]!.label, "Mercado");
  assert.equal(out[1]!.icon, "i:economia");
});

// Regressão do "só aparece 4" (2026-08-14): o painel do bloco Categorias nunca
// teve campo de quantidade, mas o formulário gravava itemsLimit=4 em qualquer
// bloco salvo — abrir o bloco uma vez cortava a home em 4 editorias sem controle
// nenhum para desfazer. Quem quer menos usa o `hidden` (teste acima).
test("resolveCategoryBlockItems: itemsLimit NÃO corta o bloco de editorias", () => {
  const out = resolveCategoryBlockItems({ itemsLimit: 2 } as never, CATS, MENU, icon);
  assert.deepEqual(out.map((c) => c.slug), ["negocios", "economia", "aviacao"]);
});

test("resolveCategoryBlockItems: lista vazia devolve []", () => {
  assert.deepEqual(resolveCategoryBlockItems({}, [], [], icon), []);
});

test("parsePlaylistId: id cru, URL de playlist e URL de video dentro dela", () => {
  assert.equal(parsePlaylistId("PLxAbc123_-defGHI"), "PLxAbc123_-defGHI");
  assert.equal(parsePlaylistId("https://www.youtube.com/playlist?list=PLxAbc123_-defGHI"), "PLxAbc123_-defGHI");
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=abc123&list=PLxAbc123_-defGHI&index=2"), "PLxAbc123_-defGHI");
});

test("parsePlaylistId: recusa vazio, video solto e esquema perigoso", () => {
  assert.equal(parsePlaylistId(""), null);
  assert.equal(parsePlaylistId(undefined), null);
  assert.equal(parsePlaylistId("https://www.youtube.com/watch?v=abc123"), null);
  assert.equal(parsePlaylistId("javascript:alert(1)"), null);
});

test("bloco playlist: tipo inferido pelo prefixo do id e formato padrao", () => {
  assert.equal(inferBlockType({ id: "playlist-1723000000", custom: true }), "playlist");
  assert.equal(defaultFormatForType("playlist"), "playlist_player");
});

/* ── "Ver mais": o destino é validado contra a superfície do blog ──────────
   O link do cabeçalho da seção era `/${block.category ?? "geral"}`. Num portal
   de esporte isso publicava `/geral` — editoria que o blog não tem — tanto para
   bloco SEM categoria quanto para bloco com `category: "geral"` explícito
   (caso real do OleySports). A presença do campo nunca provou que a rota
   existe. */
const SURFACE_OLEY = blogCategorySurface(
  [{ label: "FUTEBOL", path: "/futebol" }],
  [{ name: "COPA DO MUNDO", slug: "copa-do-mundo", visible: false }],
);
const SURFACE_SP011 = blogCategorySurface(
  [{ label: "GERAL", path: "/geral" }, { label: "POLÍTICA", path: "/politica" }],
  undefined,
);

test("V-1/V-2: bloco sem categoria (latest/most_read) nao tem destino", () => {
  assert.equal(categoryHref(undefined, SURFACE_OLEY), undefined);
  assert.equal(categoryHref("", SURFACE_OLEY), undefined);
  assert.equal(categoryHref("   ", SURFACE_OLEY), undefined);
});

test("V-3: category 'geral' EXPLICITA num blog que nao tem /geral nao vira link", () => {
  assert.equal(categoryHref("geral", SURFACE_OLEY), undefined);
});

test("V-4: categoria que existe vira link", () => {
  assert.equal(categoryHref("futebol", SURFACE_OLEY), "/futebol");
  // editoria declarada e oculta no menu também é destino válido
  assert.equal(categoryHref("copa-do-mundo", SURFACE_OLEY), "/copa-do-mundo");
});

test("V-5: no sp011, o mesmo 'geral' vira link (a editoria existe la)", () => {
  assert.equal(categoryHref("geral", SURFACE_SP011), "/geral");
  assert.equal(categoryHref("politica", SURFACE_SP011), "/politica");
  // e uma editoria de esporte NAO vira link no sp011
  assert.equal(categoryHref("futebol", SURFACE_SP011), undefined);
});

test("categoryHref nao inventa rota de dois segmentos nem aceita barra solta", () => {
  assert.equal(categoryHref("futebol/2026", SURFACE_OLEY), undefined);
  assert.equal(categoryHref("/futebol", SURFACE_OLEY), "/futebol");
  assert.equal(categoryHref("/", SURFACE_OLEY), undefined);
});
