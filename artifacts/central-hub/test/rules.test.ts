import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchBlogRules, ruleMatches, sourceBelongsToBlog, sourceCouldMatchRule, sourceMatchesAnyRule,
  type RuleForMatch,
} from "../src/lib/rules.ts";

const NEWS = {
  category: "esportes",
  sourceId: "fonte-1",
  text: "Santos renova com Miguelito até 2029 e prepara contratações",
};

function rule(partial: Partial<RuleForMatch>): RuleForMatch {
  return { isActive: true, priority: 0, ...partial };
}

describe("ruleMatches", () => {
  it("regra vazia (sem critérios) casa com tudo", () => {
    assert.equal(ruleMatches(rule({}), NEWS), true);
  });

  it("regra inativa nunca casa", () => {
    assert.equal(ruleMatches(rule({ isActive: false }), NEWS), false);
  });

  it("include de categoria (case-insensitive)", () => {
    assert.equal(ruleMatches(rule({ categoriesInclude: ["Esportes"] }), NEWS), true);
    assert.equal(ruleMatches(rule({ categoriesInclude: ["politica"] }), NEWS), false);
  });

  it("include de fonte", () => {
    assert.equal(ruleMatches(rule({ sourcesInclude: ["fonte-1"] }), NEWS), true);
    assert.equal(ruleMatches(rule({ sourcesInclude: ["fonte-2"] }), NEWS), false);
  });

  it("include de keyword (substring no texto)", () => {
    assert.equal(ruleMatches(rule({ keywordsInclude: ["miguelito"] }), NEWS), true);
    assert.equal(ruleMatches(rule({ keywordsInclude: ["flamengo"] }), NEWS), false);
  });

  it("dimensões de include são AND entre si", () => {
    assert.equal(
      ruleMatches(rule({ categoriesInclude: ["esportes"], keywordsInclude: ["flamengo"] }), NEWS),
      false,
    );
  });

  it("exclude invalida mesmo com include casando", () => {
    assert.equal(
      ruleMatches(rule({ categoriesInclude: ["esportes"], keywordsExclude: ["santos"] }), NEWS),
      false,
    );
    assert.equal(
      ruleMatches(rule({ categoriesExclude: ["esportes"] }), NEWS),
      false,
    );
    assert.equal(
      ruleMatches(rule({ sourcesExclude: ["fonte-1"] }), NEWS),
      false,
    );
  });
});

describe("matchBlogRules", () => {
  it("elegível se ALGUMA regra casar; vence a de maior priority", () => {
    const result = matchBlogRules(
      [
        rule({ categoriesInclude: ["politica"], targetCategory: "nao-deve-vencer" }),
        rule({ priority: 1, categoriesInclude: ["esportes"], targetCategory: "futebol", targetTag: "FUTEBOL" }),
        rule({ priority: 5, keywordsInclude: ["flamengo"], targetCategory: "tambem-nao" }),
      ],
      NEWS,
    );
    assert.equal(result.matched, true);
    assert.equal(result.targetCategory, "futebol");
    assert.equal(result.targetTag, "FUTEBOL");
  });

  it("nenhuma regra casando → não elegível", () => {
    const result = matchBlogRules([rule({ categoriesInclude: ["politica"] })], NEWS);
    assert.deepEqual(result, { matched: false });
  });

  it("sem regras → não elegível", () => {
    assert.deepEqual(matchBlogRules([], NEWS), { matched: false });
  });
});

describe("sourceCouldMatchRule (filtro fontes-por-blog)", () => {
  const SRC = { id: "fonte-1", category: "farmacia" };

  it("regra por categoria casa a fonte da categoria (case-insensitive)", () => {
    assert.equal(sourceCouldMatchRule(rule({ categoriesInclude: ["Farmacia"] }), SRC), true);
    assert.equal(sourceCouldMatchRule(rule({ categoriesInclude: ["financas"] }), SRC), false);
  });

  it("regra com keywords NAO exclui a fonte (keywords sao por noticia)", () => {
    assert.equal(
      sourceCouldMatchRule(rule({ categoriesInclude: ["farmacia"], keywordsInclude: ["anvisa"] }), SRC),
      true,
    );
  });

  it("catch-all (includes vazios) casa qualquer fonte, exceto categoria excluida", () => {
    assert.equal(sourceCouldMatchRule(rule({}), SRC), true);
    assert.equal(sourceCouldMatchRule(rule({ categoriesExclude: ["farmacia"] }), SRC), false);
  });

  it("include/exclude por id de fonte", () => {
    assert.equal(sourceCouldMatchRule(rule({ sourcesInclude: ["fonte-1"] }), SRC), true);
    assert.equal(sourceCouldMatchRule(rule({ sourcesInclude: ["fonte-2"] }), SRC), false);
    assert.equal(sourceCouldMatchRule(rule({ sourcesExclude: ["fonte-1"] }), SRC), false);
  });

  it("regra inativa nunca casa; sourceMatchesAnyRule = OR das regras", () => {
    assert.equal(sourceCouldMatchRule(rule({ isActive: false }), SRC), false);
    assert.equal(sourceMatchesAnyRule([rule({ categoriesInclude: ["financas"] }), rule({ categoriesInclude: ["farmacia"] })], SRC), true);
    assert.equal(sourceMatchesAnyRule([rule({ categoriesInclude: ["financas"] })], SRC), false);
    assert.equal(sourceMatchesAnyRule([], SRC), false);
  });
});

/**
 * Escopo estrito — é ele que decide o que aparece no painel de Fontes RSS do
 * blog. O caso 1 é o incidente de 2026-08-14: o credito.vc recebeu 112 fontes
 * (football, oc-aviacao, farmacia) porque tinha regra por keyword, que no
 * critério permissivo casa qualquer fonte.
 */
describe("sourceBelongsToBlog (escopo estrito do painel do blog)", () => {
  const ESPORTE = { id: "fonte-esporte", category: "futebol" };
  const FINANCAS = { id: "fonte-financas", category: "financas" };

  const REGRAS_CREDITOVC = [
    rule({ categoriesInclude: ["financas"], priority: 10 }),
    rule({ keywordsInclude: ["serasa", "score"], priority: 28 }), // sem categoria
  ];

  it("regra por keyword NAO arrasta fonte de outro nicho", () => {
    assert.equal(sourceBelongsToBlog(REGRAS_CREDITOVC, FINANCAS), true);
    assert.equal(sourceBelongsToBlog(REGRAS_CREDITOVC, ESPORTE), false);
    // o critério permissivo (página Fontes, antes) deixava as duas passarem
    assert.equal(sourceMatchesAnyRule(REGRAS_CREDITOVC, ESPORTE), true);
  });

  it("escopo explicito vence catch-all no mesmo blog", () => {
    const regras = [rule({ categoriesInclude: ["financas"] }), rule({})];
    assert.equal(sourceBelongsToBlog(regras, ESPORTE), false);
    assert.equal(sourceBelongsToBlog(regras, FINANCAS), true);
  });

  it("blog SO com catch-all (sp011) fica com tudo menos os excludes", () => {
    const regras = [rule({ categoriesExclude: ["financas"] })];
    assert.equal(sourceBelongsToBlog(regras, ESPORTE), true);
    assert.equal(sourceBelongsToBlog(regras, FINANCAS), false);
  });

  it("regra que nomeia mas esta INATIVA nao define o escopo", () => {
    // só a inativa nomeia categoria: quem manda é a catch-all ativa
    const regras = [rule({ categoriesInclude: ["financas"], isActive: false }), rule({})];
    assert.equal(sourceBelongsToBlog(regras, ESPORTE), true);
  });

  it("include por id de fonte tambem define escopo explicito", () => {
    const regras = [rule({ sourcesInclude: ["fonte-financas"] }), rule({ keywordsInclude: ["pix"] })];
    assert.equal(sourceBelongsToBlog(regras, FINANCAS), true);
    assert.equal(sourceBelongsToBlog(regras, ESPORTE), false);
  });

  it("blog sem regra nenhuma nao recebe fonte nenhuma", () => {
    assert.equal(sourceBelongsToBlog([], ESPORTE), false);
  });
});
