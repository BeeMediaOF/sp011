import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCaption,
  buildCaptionPrompt,
  parseCaptionOutput,
  DEFAULT_CAPTION_PROMPT_TEMPLATE,
} from "../src/lib/social/caption.ts";

describe("buildCaption", () => {
  it("junta legenda, CTA, créditos e hashtags com linha em branco", () => {
    const out = buildCaption({
      caption: "Golaço no clássico",
      cta: "Comenta aí! ",
      credits: "@craque_oficial",
      hashtags: "futebol, viral #brasil",
    });
    const blocks = out.split("\n\n");
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0], "Golaço no clássico");
    assert.equal(blocks[1], "Comenta aí!");
    assert.ok(blocks[2].endsWith("Créditos: @craque_oficial"));
    assert.equal(blocks[3], "#futebol #viral #brasil");
  });

  it("omite blocos vazios", () => {
    assert.equal(buildCaption({ caption: "Só legenda" }), "Só legenda");
    assert.equal(buildCaption({}), "");
    assert.equal(buildCaption({ caption: "  ", hashtags: " " }), "");
  });

  it("créditos ganham @ único mesmo se o usuário digitou com @", () => {
    const out = buildCaption({ credits: "@@user" });
    assert.ok(out.includes("Créditos: @user"));
    const out2 = buildCaption({ credits: "user" });
    assert.ok(out2.includes("Créditos: @user"));
  });

  it("hashtags normalizadas: separa por espaço/vírgula e prefixa #", () => {
    const out = buildCaption({ hashtags: "a,b  #c" });
    assert.equal(out, "#a #b #c");
  });
});

describe("buildCaptionPrompt", () => {
  it("substitui placeholders no template padrão", () => {
    const out = buildCaptionPrompt("Legenda original aqui", "creator_x");
    assert.ok(out.includes("Legenda original aqui"));
    assert.ok(out.includes("@creator_x"));
    assert.ok(!out.includes("{{LEGENDA}}"));
    assert.ok(!out.includes("{{CREATOR}}"));
  });

  it("corta a legenda original em 500 chars e aceita template custom", () => {
    const out = buildCaptionPrompt("a".repeat(900), "", "X {{LEGENDA}} Y @{{CREATOR}}");
    assert.equal(out, `X ${"a".repeat(500)} Y @desconhecido`);
  });

  it("template vazio/whitespace cai no padrão", () => {
    const out = buildCaptionPrompt("z", "c", "   ");
    assert.ok(out.startsWith(DEFAULT_CAPTION_PROMPT_TEMPLATE.slice(0, 30)));
  });
});

describe("parseCaptionOutput", () => {
  it("1ª linha vira título, resto vira legenda", () => {
    const { title, caption } = parseCaptionOutput("TÍTULO FORTE\n\nHook de retenção\nPergunta?\n\n#tag");
    assert.equal(title, "TÍTULO FORTE");
    assert.ok(caption.includes("Hook de retenção"));
    assert.ok(caption.includes("#tag"));
  });

  it("remove cercas de código e rótulos estruturais", () => {
    const raw = "```text\nTÍTULO:\nManchete real\nHOOK: gancho aqui\n(linha em branco)\nHASHTAGS\n#a #b\n```";
    const { title, caption } = parseCaptionOutput(raw);
    assert.equal(title, "Manchete real");
    assert.ok(caption.includes("gancho aqui"));
    assert.ok(!caption.includes("HOOK"));
    assert.ok(!caption.includes("linha em branco"));
    assert.ok(caption.includes("#a #b"));
  });

  it("entrada vazia → título e legenda vazios", () => {
    assert.deepEqual(parseCaptionOutput(""), { title: "", caption: "" });
    assert.deepEqual(parseCaptionOutput("\n\n"), { title: "", caption: "" });
  });

  it("título é cortado em 80 chars e legenda em 2000", () => {
    const { title, caption } = parseCaptionOutput(`${"t".repeat(120)}\n${"c".repeat(3000)}`);
    assert.equal(title.length, 80);
    assert.equal(caption.length, 2000);
  });
});
