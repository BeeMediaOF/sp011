/**
 * Testes dos helpers dos blocos da home (fluxo crítico do painel admin):
 * inferência de tipo (retrocompat com blocos antigos), URLs de vídeo/embed
 * seguras e formatos padrão. Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferBlockType, defaultFormatForType, parseVideoEmbedUrl,
  isDirectVideoFile, safeEmbedUrl, safeLinkUrl,
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
