import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROMPT_TEMPLATE, applyPromptTemplate, resolvePrompt } from "../src/prompts.ts";

describe("applyPromptTemplate", () => {
  it("substitui todos os placeholders", () => {
    const out = applyPromptTemplate(
      "T={{TITULO}} F={{FONTE}} C={{CREDITO}} X={{TEXTO}}",
      "Título", "corpo", "Agência Z", true,
    );
    assert.ok(out.includes("T=Título"));
    assert.ok(out.includes("F=Agência Z"));
    assert.ok(out.includes("conforme informação divulgada por Agência Z"));
    assert.ok(out.includes("X=corpo"));
    assert.ok(!out.includes("{{"));
  });

  it("sem crédito usa a linha de dispensa", () => {
    const out = applyPromptTemplate("{{CREDITO}}", "t", "x", "Fonte", false);
    assert.ok(out.includes("Não é necessário citar a fonte"));
  });

  it("corta o texto da fonte em 7000 caracteres", () => {
    const out = applyPromptTemplate("{{TEXTO}}", "t", "a".repeat(9000), "F", false);
    assert.equal(out.length, 7000);
  });
});

describe("resolvePrompt (hierarquia fonte > categoria > global > default)", () => {
  const prompts = { global: "GLOBAL", categories: { esportes: "CAT-ESPORTES" } };

  it("customPrompt da fonte vence tudo", () => {
    assert.equal(resolvePrompt({ customPrompt: "CUSTOM", category: "esportes" }, prompts), "CUSTOM");
  });

  it("prompt da categoria vence o global", () => {
    assert.equal(resolvePrompt({ category: "esportes" }, prompts), "CAT-ESPORTES");
  });

  it("global vence o default", () => {
    assert.equal(resolvePrompt({ category: "politica" }, prompts), "GLOBAL");
  });

  it("sem nada, usa o template padrão", () => {
    assert.equal(resolvePrompt({ category: "politica" }, undefined), DEFAULT_PROMPT_TEMPLATE);
  });
});
