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
  type HomeBlock,
} from "./homeBlocks";

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
