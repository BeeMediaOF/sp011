import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFromRawAI, isContentRenderable } from "../src/quality.ts";

const GOOD_HTML = "<h2>Subtítulo da matéria</h2><p>Primeiro parágrafo com conteúdo suficiente.</p>";

describe("extractFromRawAI", () => {
  it("JSON limpo → extrai todos os campos", () => {
    const raw = JSON.stringify({
      title: "Título", subtitle: "Sub", social_title: "MANCHETE *FORTE*",
      social_summary: "Resumo.", social_hashtags: "#a #b",
      content_html: GOOD_HTML, slug: "titulo-slug", keywords: "k1, k2",
    });
    const out = extractFromRawAI(raw);
    assert.ok(out);
    assert.equal(out.content, GOOD_HTML);
    assert.equal(out.title, "Título");
    assert.ok(out.socialTitle!.includes("*FORTE*"));
    assert.equal(out.slug, "titulo-slug");
  });

  it("cerca markdown com newline inicial (bug original) → ainda extrai", () => {
    const raw = "\n```json\n" + JSON.stringify({ content_html: GOOD_HTML, title: "T" }) + "\n```\n";
    const out = extractFromRawAI(raw);
    assert.ok(out);
    assert.equal(out.content, GOOD_HTML);
  });

  it("JSON truncado → recupera via regex", () => {
    const raw = '{"title": "Título truncado", "content_html": "<h2>Corpo recuperável do artigo</h2><p>Texto longo o bastante.</p>", "keyw';
    const out = extractFromRawAI(raw);
    assert.ok(out);
    assert.ok(out.content.includes("Corpo recuperável"));
    assert.equal(out.title, "Título truncado");
  });

  it("HTML puro passa como está", () => {
    const out = extractFromRawAI(GOOD_HTML);
    assert.ok(out);
    assert.equal(out.content, GOOD_HTML);
  });

  it("lixo curto → null", () => {
    assert.equal(extractFromRawAI(""), null);
    assert.equal(extractFromRawAI("{}"), null);
    assert.equal(extractFromRawAI("{ \"a\": 1 }"), null);
  });
});

describe("isContentRenderable", () => {
  it("true para HTML, false para JSON sem content_html", () => {
    assert.equal(isContentRenderable(GOOD_HTML), true);
    assert.equal(isContentRenderable('{"foo": "bar"}'), false);
  });
});
