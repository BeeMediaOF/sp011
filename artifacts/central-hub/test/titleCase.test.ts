import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTitleCase, normalizeTitleCaseMode } from "../src/lib/titleCase.ts";

describe("normalizeTitleCaseMode", () => {
  it("aceita os 3 modos; qualquer outra coisa vira original", () => {
    assert.equal(normalizeTitleCaseMode("upper"), "upper");
    assert.equal(normalizeTitleCaseMode("sentence"), "sentence");
    assert.equal(normalizeTitleCaseMode("original"), "original");
    assert.equal(normalizeTitleCaseMode("x"), "original");
    assert.equal(normalizeTitleCaseMode(undefined), "original");
  });
});

describe("applyTitleCase", () => {
  it("original: não mexe", () => {
    assert.equal(applyTitleCase("Espanha garante vaga na Final", "original"), "Espanha garante vaga na Final");
  });

  it("upper: tudo em maiúsculas (acentos preservados)", () => {
    assert.equal(applyTitleCase("Espanha é campeã", "upper"), "ESPANHA É CAMPEÃ");
  });

  it("sentence: título GRITADO vira caixa normal com inicial maiúscula", () => {
    assert.equal(
      applyTitleCase("SANTOS FUTEBOL CLUBE ANUNCIA GRANDE REFORÇO", "sentence"),
      "Santos futebol clube anuncia grande reforço",
    );
  });

  it("sentence: título já em caixa mista fica intacto (siglas preservadas)", () => {
    assert.equal(
      applyTitleCase("NFL libera ingressos para o jogo no Maracanã", "sentence"),
      "NFL libera ingressos para o jogo no Maracanã",
    );
  });

  it("sentence: capitaliza início de cada frase", () => {
    assert.equal(applyTitleCase("FIM DE JOGO. ESPANHA NA FINAL!", "sentence"), "Fim de jogo. Espanha na final!");
  });

  it("entrada vazia é segura", () => {
    assert.equal(applyTitleCase("", "upper"), "");
    assert.equal(applyTitleCase("  ", "sentence"), "");
  });
});
