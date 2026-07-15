import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchCategorySlug } from "../src/ai/rewrite.ts";

// Taxonomia real do PontoFarma (incidente 2026-07: tudo caía em "outros")
const FARMA = [
  { slug: "gestao" }, { slug: "fiscal-tributario" }, { slug: "legislacao" },
  { slug: "mercado" }, { slug: "vendas" }, { slug: "equipe" },
  { slug: "tecnologia" }, { slug: "saude-categorias" }, { slug: "outros" },
];

describe("matchCategorySlug", () => {
  it("slug exato casa", () => {
    assert.equal(matchCategorySlug("fiscal-tributario", FARMA), "fiscal-tributario");
    assert.equal(matchCategorySlug("gestao", FARMA), "gestao");
  });

  it("rótulo humano com acento/&/conectivo casa o slug", () => {
    assert.equal(matchCategorySlug("Fiscal & Tributário", FARMA), "fiscal-tributario");
    assert.equal(matchCategorySlug("Saúde e Categorias", FARMA), "saude-categorias");
    assert.equal(matchCategorySlug("Gestão", FARMA), "gestao");
  });

  it("resposta com aspas/ponto/texto em volta casa", () => {
    assert.equal(matchCategorySlug('"legislacao"', FARMA), "legislacao");
    assert.equal(matchCategorySlug("A categoria é mercado.", FARMA), "mercado");
  });

  it("ambiguidade: vence o slug mais específico (mais tokens)", () => {
    const cats = [{ slug: "credito" }, { slug: "credito-imobiliario" }];
    assert.equal(matchCategorySlug("credito imobiliario", cats), "credito-imobiliario");
  });

  it("resposta sem categoria da lista → null (fallback residual do chamador)", () => {
    assert.equal(matchCategorySlug("esportes", FARMA), null);
    assert.equal(matchCategorySlug("", FARMA), null);
    assert.equal(matchCategorySlug(null, FARMA), null);
    assert.equal(matchCategorySlug("nao sei classificar essa noticia", FARMA), null);
  });

  it("slugs EN do ksports continuam casando", () => {
    const EN = [{ slug: "world-cup" }, { slug: "formula-1" }, { slug: "esports" }, { slug: "others" }];
    assert.equal(matchCategorySlug("World Cup", EN), "world-cup");
    assert.equal(matchCategorySlug("formula-1", EN), "formula-1");
    assert.equal(matchCategorySlug("others", EN), "others");
  });

  it("match parcial: tema natural casa slug composto quando é único", () => {
    // Modelo responde "saúde"/"fiscal" em vez do slug composto → não pode
    // cair no residual (incidente PontoFarma 2026-07, segunda rodada)
    assert.equal(matchCategorySlug("Saúde", FARMA), "saude-categorias");
    assert.equal(matchCategorySlug("fiscal", FARMA), "fiscal-tributario");
    assert.equal(matchCategorySlug("tributário", FARMA), "fiscal-tributario");
    assert.equal(matchCategorySlug("A categoria é saúde.", FARMA), "saude-categorias");
  });

  it("match parcial na taxonomia do creditovc", () => {
    const CVC = [
      { slug: "sair-das-dividas" }, { slug: "credito" }, { slug: "score" },
      { slug: "organizar-financas" }, { slug: "renda-extra" },
      { slug: "planejar-o-futuro" }, { slug: "investimentos" }, { slug: "outros" },
    ];
    assert.equal(matchCategorySlug("dívidas", CVC), "sair-das-dividas");
    assert.equal(matchCategorySlug("finanças", CVC), "organizar-financas");
    assert.equal(matchCategorySlug("planejamento do futuro", CVC), "planejar-o-futuro");
  });

  it("match parcial ambíguo (empate) → null", () => {
    const cats = [{ slug: "credito-rural" }, { slug: "credito-imobiliario" }];
    assert.equal(matchCategorySlug("crédito", cats), null);
  });

  it("match parcial: futebol-americano por 'americano', exato ainda vence", () => {
    const PT = [{ slug: "futebol" }, { slug: "futebol-americano" }, { slug: "outros" }];
    assert.equal(matchCategorySlug("futebol", PT), "futebol");
    assert.equal(matchCategorySlug("americano", PT), "futebol-americano");
  });
});
