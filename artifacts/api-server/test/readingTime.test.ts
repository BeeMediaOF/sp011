import { test } from "node:test";
import assert from "node:assert/strict";
import { readingMinutes } from "../src/lib/readingTime.ts";

test("vazio conta como 1 minuto", () => {
  assert.equal(readingMinutes(""), 1);
});

test("texto curto arredonda para o mínimo de 1 minuto", () => {
  assert.equal(readingMinutes("<p>Notícia curta de teste.</p>"), 1);
});

test("~1000 palavras dão 5 minutos", () => {
  const html = `<p>${Array.from({ length: 1000 }, (_, i) => `palavra${i}`).join(" ")}</p>`;
  assert.equal(readingMinutes(html), 5);
});

test("tags HTML não contam como palavras", () => {
  // 10 palavras reais afogadas em markup — markup não pode inflar a conta.
  const words = Array.from({ length: 10 }, (_, i) => `w${i}`);
  const html = words.map((w) => `<div class="bloco grande"><span style="color:red">${w}</span></div>`).join("");
  assert.equal(readingMinutes(html), 1);
});

test("tags coladas separam palavras (não gruda w1w2)", () => {
  const html = `<p>um</p><p>${Array.from({ length: 399 }, (_, i) => `p${i}`).join(" ")}</p>`;
  assert.equal(readingMinutes(html), 2);
});
