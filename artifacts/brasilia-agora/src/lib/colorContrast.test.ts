import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeLuminance, isDarkBg, inkOn } from "./colorContrast";

test("relativeLuminance: extremos e formatos aceitos", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(relativeLuminance("#fff"), 1);            // hex curto
  assert.equal(relativeLuminance("rgb(255, 255, 255)"), 1);
  assert.equal(relativeLuminance("nao-e-cor"), null);
});

test("isDarkBg: barra clara pede tinta escura", () => {
  // O caso do bug: template com menuBarBgColor branco + menu branco = invisível
  assert.equal(isDarkBg("#ffffff"), false);
  assert.equal(isDarkBg("#f7f9fb"), false);
  assert.equal(isDarkBg("#1a2448"), true);   // barra escura padrão do centered
  assert.equal(isDarkBg("#14265e"), true);   // navy do O Comandante
  assert.equal(isDarkBg("#0a1740"), true);
  // Cor irreconhecível mantém o comportamento histórico (tinta branca)
  assert.equal(isDarkBg(""), true);
  assert.equal(isDarkBg("var(--x)"), true);
});

test("inkOn: branco sobre escuro, tinta do menu sobre claro", () => {
  assert.equal(inkOn("#1a2448"), "#ffffff");
  assert.equal(inkOn("#ffffff"), "#101418");
  assert.equal(inkOn("#ffffff", "#334155"), "#334155");  // respeita o menuTextColor
});
