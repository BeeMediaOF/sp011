/**
 * Testes das funções de sanitização (fluxo crítico anti-XSS).
 * Rodar com: pnpm run test  (node:test via tsx — sem framework adicional)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTitleHtml, sanitizeArticleHtml, isVideoEmbedSrc } from "./sanitize";

test("safeTitleHtml: mantém texto simples e decodifica entidades comuns", () => {
  assert.equal(safeTitleHtml("Lula diz &quot;sim&quot; ao acordo"), "Lula diz &quot;sim&quot; ao acordo");
  assert.equal(safeTitleHtml("Dólar &amp; Bolsa"), "Dólar &amp; Bolsa");
  assert.equal(safeTitleHtml("Caf&eacute; em alta"), "Café em alta");
});

test("safeTitleHtml: remove tags e neutraliza payloads de XSS", () => {
  // Tag removida; o texto interno sobra como TEXTO inerte (nunca executa)
  assert.equal(safeTitleHtml("<script>alert(1)</script>Título"), "alert(1)Título");
  assert.equal(safeTitleHtml("<img src=x onerror=alert(1)>Manchete"), "Manchete");
  // Entidades que codificam tags são decodificadas e RE-escapadas (não viram HTML)
  assert.equal(safeTitleHtml("&lt;b&gt;negrito&lt;/b&gt;"), "&lt;b&gt;negrito&lt;/b&gt;");
  // Nunca sobra < > " sem escape na saída
  const out = safeTitleHtml('<a href="x">clique</a> & <svg onload=alert(1)>');
  assert.ok(!/<|>|(?<!&quot;)"/.test(out.replace(/&(amp|lt|gt|quot);/g, "")));
});

test("safeTitleHtml: entradas vazias", () => {
  assert.equal(safeTitleHtml(""), "");
  assert.equal(safeTitleHtml(null), "");
  assert.equal(safeTitleHtml(undefined), "");
});

test("sanitizeArticleHtml: no SSR sanitiza sem DOM e preserva o HTML seguro", () => {
  // Em Node não há window/DOM — entra o sanitizador isomórfico (stripDangerousHtml).
  // Ele precisa devolver HTML equivalente ao do cliente (SSR ≠ cliente causa
  // hydration mismatch → React #418 descarta o SSR), removendo o que é perigoso.
  assert.equal(sanitizeArticleHtml("<p>ok</p><script>alert(1)</script>"), "<p>ok</p>");
  assert.equal(sanitizeArticleHtml(""), "");
  // Handlers inline e javascript: nunca sobrevivem
  const out = sanitizeArticleHtml('<p onclick="alert(1)">x</p><a href="javascript:alert(1)">y</a>');
  assert.ok(!/onclick|javascript:/i.test(out));
  assert.ok(out.includes("x") && out.includes("y"));
});

test("isVideoEmbedSrc: só players de vídeo em https", () => {
  assert.equal(isVideoEmbedSrc("https://www.youtube.com/embed/abc123"), true);
  assert.equal(isVideoEmbedSrc("https://youtube.com/embed/abc123"), true);
  assert.equal(isVideoEmbedSrc("https://www.youtube-nocookie.com/embed/abc"), true);
  assert.equal(isVideoEmbedSrc("https://player.vimeo.com/video/12345"), true);
  assert.equal(isVideoEmbedSrc("http://www.youtube.com/embed/abc"), false);   // sem https
  assert.equal(isVideoEmbedSrc("https://www.youtube.com/watch?v=abc"), false); // não é embed
  assert.equal(isVideoEmbedSrc("https://evil.com/embed/abc"), false);
  assert.equal(isVideoEmbedSrc("https://evil.com/?x=youtube.com/embed/"), false);
  assert.equal(isVideoEmbedSrc(""), false);
  assert.equal(isVideoEmbedSrc(null), false);
});

test("sanitizeArticleHtml: vídeo do editor sobrevive, iframe estranho não", () => {
  // O botão "Vídeo YouTube" do editor grava exatamente esta estrutura.
  const yt = '<div data-youtube-video><iframe width="720" height="405" src="https://www.youtube.com/embed/AbC_123" allowfullscreen></iframe></div>';
  const out = sanitizeArticleHtml(`<p>antes</p>${yt}<p>depois</p>`);
  assert.ok(out.includes('src="https://www.youtube.com/embed/AbC_123"'));
  assert.ok(out.includes("antes") && out.includes("depois"));

  // Qualquer outro host continua sendo removido, com ou sem tag de fechamento
  assert.ok(!sanitizeArticleHtml('<iframe src="https://evil.com/x"></iframe>').includes("<iframe"));
  assert.ok(!sanitizeArticleHtml('<iframe src="https://evil.com/x">').includes("<iframe"));
  assert.ok(!sanitizeArticleHtml('<p>a</p><iframe src="/local"></iframe>').includes("<iframe"));
});

test("sanitizeArticleHtml: srcdoc e handlers caem mesmo em iframe permitido", () => {
  const out = sanitizeArticleHtml(
    '<iframe src="https://www.youtube.com/embed/x" srcdoc="<script>alert(1)</script>" onload="alert(2)"></iframe>',
  );
  assert.ok(out.includes("<iframe"));
  assert.ok(!/srcdoc/i.test(out));
  assert.ok(!/onload/i.test(out));
});
