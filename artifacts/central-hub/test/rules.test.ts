import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchBlogRules, ruleMatches, type RuleForMatch } from "../src/lib/rules.ts";

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
