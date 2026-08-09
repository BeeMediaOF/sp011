import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getYoutubeId, getVimeoId,
  buildVideoEmbed, buildGalleryBlock, buildCitationBlock, buildInlineImage,
} from "./articleEmbeds";

test("getYoutubeId aceita watch, youtu.be e embed", () => {
  assert.equal(getYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYoutubeId("https://youtu.be/dQw4w9WgXcQ?t=30"), "dQw4w9WgXcQ");
  assert.equal(getYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYoutubeId("https://exemplo.com/video.mp4"), null);
});

test("getVimeoId pega o id numerico", () => {
  assert.equal(getVimeoId("https://vimeo.com/76979871"), "76979871");
  assert.equal(getVimeoId("https://youtu.be/dQw4w9WgXcQ"), null);
});

test("buildVideoEmbed: YouTube vira player no host que a sanitizacao permite", () => {
  const html = buildVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.ok(html.includes('src="https://www.youtube.com/embed/dQw4w9WgXcQ"'), html);
  // classe + data-block sao o que faz o bloco sobreviver ao editor e ao ingest
  assert.ok(html.includes('data-block="video"'), html);
  assert.ok(html.includes('class="video-embed"'), html);
  assert.ok(html.includes("allowfullscreen"), html);
});

test("buildVideoEmbed: Vimeo usa player.vimeo.com", () => {
  const html = buildVideoEmbed("https://vimeo.com/76979871");
  assert.ok(html.includes('src="https://player.vimeo.com/video/76979871"'), html);
});

test("buildVideoEmbed: URL solta vira <video> de bloco (sem wrapper <p>)", () => {
  const html = buildVideoEmbed("https://cdn.exemplo.com/clipe.mp4");
  assert.ok(html.startsWith("<video"), html);
  assert.ok(html.includes("controls"), html);
  assert.ok(!html.includes("<p>"), html);
});

test("buildVideoEmbed: entrada vazia nao gera bloco", () => {
  assert.equal(buildVideoEmbed(""), "");
  assert.equal(buildVideoEmbed("   "), "");
});

test("buildVideoEmbed: aspas na URL nao escapam do atributo", () => {
  const html = buildVideoEmbed('https://cdn.exemplo.com/a.mp4" onerror="alert(1)');
  assert.ok(!html.includes('onerror="alert(1)"'), html);
  assert.ok(html.includes("&quot;"), html);
});

test("buildGalleryBlock ignora campos vazios e devolve '' sem imagem", () => {
  assert.equal(buildGalleryBlock(["", "  "]), "");
  const html = buildGalleryBlock(["https://x/1.jpg", " ", "https://x/2.jpg"]);
  assert.equal(html.match(/<img/g)?.length, 2, html);
  assert.ok(html.includes('data-block="galeria"'), html);
});

test("buildCitationBlock usa marcas (em/strong), que sobrevivem ao editor", () => {
  const html = buildCitationBlock("O jogo virou", "Tecnico");
  assert.ok(html.includes("<em>"), html);
  assert.ok(html.includes("<strong>"), html);
  assert.ok(html.includes('data-block="citacao"'), html);
  assert.equal(buildCitationBlock("   ", "alguem"), "");
});

test("buildCitationBlock escapa HTML do texto do usuario", () => {
  const html = buildCitationBlock("<script>alert(1)</script>", "");
  assert.ok(!html.includes("<script>"), html);
  assert.ok(html.includes("&lt;script&gt;"), html);
});

test("buildInlineImage muda o style conforme o alinhamento", () => {
  assert.ok(buildInlineImage("https://x/a.jpg", "foto", "left").includes("float:left"));
  assert.ok(buildInlineImage("https://x/a.jpg", "foto", "right").includes("float:right"));
  assert.ok(buildInlineImage("https://x/a.jpg", "foto", "center").includes("margin:20px auto"));
  assert.equal(buildInlineImage("", "foto", "center"), "");
});
