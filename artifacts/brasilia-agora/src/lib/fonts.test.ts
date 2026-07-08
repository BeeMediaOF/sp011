/**
 * Testes do registro de fontes por bloco: contrato do catálogo (ids únicos,
 * mínimo de 20 opções, google query só onde faz sentido) e resolução do estilo
 * aplicado no render (padrão do site = undefined → bloco byte-idêntico).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FONT_OPTIONS, FONT_GROUP_LABELS, fontCss, blockFontStyle } from "./fonts";

test("catálogo tem 20+ fontes com ids únicos e grupos válidos", () => {
  assert.ok(FONT_OPTIONS.length >= 20, `esperava 20+, tem ${FONT_OPTIONS.length}`);
  const ids = new Set(FONT_OPTIONS.map((f) => f.id));
  assert.equal(ids.size, FONT_OPTIONS.length, "ids duplicados no catálogo");
  for (const f of FONT_OPTIONS) {
    assert.ok(f.group in FONT_GROUP_LABELS, `grupo desconhecido: ${f.group}`);
    assert.ok(f.css.length > 0, `pilha css vazia em ${f.id}`);
  }
});

test("fontes do site e do sistema não têm download do Google", () => {
  for (const f of FONT_OPTIONS.filter((o) => o.group === "site" || o.group === "system")) {
    assert.equal(f.google, undefined, `${f.id} não deveria ter query do Google`);
  }
  // As demais precisam da query (senão nunca carregam no cliente).
  for (const f of FONT_OPTIONS.filter((o) => o.group === "sans" || o.group === "serif" || o.group === "display")) {
    assert.ok(f.google, `${f.id} sem query do Google Fonts`);
    assert.ok(!f.google!.includes(" "), `${f.id}: query com espaço não escapado (use +)`);
  }
});

test("fontCss resolve id e devolve null para vazio/desconhecido", () => {
  assert.ok(fontCss("roboto")?.includes("Roboto"));
  assert.equal(fontCss(""), null);
  assert.equal(fontCss(undefined), null);
  assert.equal(fontCss("fonte-que-nao-existe"), null);
});

test("blockFontStyle: sem fonte = undefined; com fonte sobrescreve as variáveis do tema", () => {
  assert.equal(blockFontStyle(undefined), undefined);
  assert.equal(blockFontStyle(""), undefined);
  const style = blockFontStyle("playfair") as Record<string, string>;
  assert.ok(style.fontFamily.includes("Playfair Display"));
  // As utilities font-sans/font-serif do Tailwind apontam para --app-font-* —
  // sem essas variáveis os títulos serif dos cards não trocariam de fonte.
  assert.equal(style["--app-font-sans"], style.fontFamily);
  assert.equal(style["--app-font-serif"], style.fontFamily);
  assert.equal(style["--font-sans"], style.fontFamily);
  assert.equal(style["--font-serif"], style.fontFamily);
});
