import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRewriteResult, trimSlug } from "../src/ai/rewrite.ts";

describe("trimSlug", () => {
  it("limita a 5 palavras significativas", () => {
    assert.equal(
      trimSlug("o-prefeito-de-sao-paulo-inaugura-novo-hospital-na-zona-norte"),
      "prefeito-sao-paulo-inaugura-novo",
    );
  });

  it("respeita o teto de 55 caracteres cortando em hífen", () => {
    const slug = trimSlug("palavralongademais-".repeat(5) + "fim");
    assert.ok(slug.length <= 55);
    assert.ok(!slug.endsWith("-"));
  });
});

describe("parseRewriteResult", () => {
  it("JSON com cerca markdown", () => {
    const raw = "```json\n" + JSON.stringify({
      title: "T", subtitle: "S", content_html: "<h2>Ok</h2><p>Corpo</p>",
      slug: "titulo-de-teste-longo-demais-sim", keywords: "a, b",
      social_title: "*DESTAQUE* NA MANCHETE",
    }) + "\n```";
    const out = parseRewriteResult(raw);
    assert.equal(out.content, "<h2>Ok</h2><p>Corpo</p>");
    assert.equal(out.title, "T");
    assert.ok(out.socialTitle!.includes("*DESTAQUE*"));
  });

  it("formato antigo SLUG:/KEYWORDS:", () => {
    const raw = "Texto do artigo.\nSLUG: [meu-slug-de-teste]\nKEYWORDS: [k1, k2]";
    const out = parseRewriteResult(raw);
    assert.equal(out.slug, "meu-slug-teste"); // trimSlug remove o stop-word "de"
    assert.equal(out.keywords, "k1, k2");
    assert.equal(out.content, "Texto do artigo.");
  });
});
