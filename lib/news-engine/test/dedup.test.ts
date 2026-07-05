import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSimilarTitle, normalizeTitle, titleKeywords, titleOverlap, OVERLAP_THRESHOLD } from "../src/dedup.ts";

describe("normalizeTitle", () => {
  it("baixa caixa, apara e colapsa espaços", () => {
    assert.equal(normalizeTitle("  Lula  Anuncia   NOVO Pacote "), "lula anuncia novo pacote");
  });
});

describe("titleKeywords", () => {
  it("remove acentos e palavras curtas", () => {
    const words = titleKeywords("Governo anuncia ação de saúde em São Paulo");
    assert.ok(words.has("governo"));
    assert.ok(words.has("anuncia"));
    assert.ok(words.has("saude"));
    assert.ok(words.has("paulo"));
    assert.ok(words.has("acao")); // "ação" → "acao" (4 letras, mantém)
    assert.ok(!words.has("de"));
    assert.ok(!words.has("em"));
    assert.ok(!words.has("sao")); // 3 letras
  });
});

describe("titleOverlap / isSimilarTitle", () => {
  it("detecta a mesma notícia com títulos quase iguais", () => {
    const a = "Governo libera novo saque do FGTS para milhões de trabalhadores";
    const b = "Governo libera novo saque do FGTS para trabalhadores neste mês";
    assert.ok(titleOverlap(a, b) >= OVERLAP_THRESHOLD);
    assert.ok(isSimilarTitle(a, b));
  });

  it("não casa notícias diferentes", () => {
    const a = "Santos renova contrato com atacante até 2029";
    const b = "Prefeitura inaugura hospital veterinário na zona norte";
    assert.ok(!isSimilarTitle(a, b));
  });

  it("títulos com menos de 4 palavras significativas nunca casam", () => {
    assert.equal(titleOverlap("Lula viaja hoje", "Lula viaja hoje"), 0);
  });
});
