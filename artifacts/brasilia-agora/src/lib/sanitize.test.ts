/**
 * Testes das funções de sanitização (fluxo crítico anti-XSS).
 * Rodar com: pnpm run test  (node:test via tsx — sem framework adicional)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTitleHtml, sanitizeArticleHtml } from "./sanitize";

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

test("sanitizeArticleHtml: retorna vazio fora do browser (SSR nunca renderiza corpo de artigo)", () => {
  // Em Node não há window/DOM — a função deve falhar fechada (string vazia),
  // nunca devolver o HTML cru.
  assert.equal(sanitizeArticleHtml("<p>ok</p><script>alert(1)</script>"), "");
  assert.equal(sanitizeArticleHtml(""), "");
});
