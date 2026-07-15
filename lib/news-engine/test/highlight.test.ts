import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasAiArtifacts, sanitizePlainField, sanitizeSocialTitle, stripInlineHtml } from "../src/highlight.ts";
import { extractFromRawAI } from "../src/quality.ts";
import { parseRewriteResult } from "../src/ai/rewrite.ts";

const GOOD_HTML = "<h2>Subtítulo da matéria</h2><p>Primeiro parágrafo com conteúdo suficiente.</p>";

describe("stripInlineHtml", () => {
  it("remove tags vazadas pela IA no título", () => {
    assert.equal(
      stripInlineHtml("<b>Fórmula 1</b>: <b>Charles Leclerc</b> vence o <b>GP da Grã-Bretanha</b>"),
      "Fórmula 1: Charles Leclerc vence o GP da Grã-Bretanha",
    );
  });

  it("decodifica entidades comuns e colapsa espaços", () => {
    assert.equal(stripInlineHtml("Lucro&nbsp;da&nbsp;empresa &amp; sócios"), "Lucro da empresa & sócios");
    assert.equal(stripInlineHtml("A &lt;nova&gt; era"), "A <nova> era");
  });

  it("texto sem HTML passa intacto", () => {
    const s = "Título normal, sem marcação nenhuma";
    assert.equal(stripInlineHtml(s), s);
  });
});

describe("sanitizeSocialTitle", () => {
  it("<b> no social_title vira UM par de asteriscos (destaque preservado)", () => {
    assert.equal(
      sanitizeSocialTitle("Leclerc vence em <b>Silverstone</b> e amplia liderança"),
      "Leclerc vence em *Silverstone* e amplia liderança",
    );
  });

  it("múltiplos <b> → só o primeiro par de destaque sobrevive", () => {
    const out = sanitizeSocialTitle("<b>Fórmula 1</b>: <b>Leclerc</b> vence");
    assert.equal(out, "*Fórmula 1*: Leclerc vence");
  });

  it("outras tags são removidas sem virar destaque", () => {
    assert.equal(sanitizeSocialTitle("Alta de <em>7%</em> no mês"), "Alta de 7% no mês");
  });
});

describe("hasAiArtifacts / sanitizePlainField (guarda de qualidade)", () => {
  it("casos REAIS de produção → detectados", () => {
    // qwen vazou chinês no meio do título
    assert.ok(hasAiArtifacts("Vereadora pronta para desentrelaçar纷争, Flávio e Michelle buscam reconciliação"));
    // instrução interna do modelo em chinês no social_title
    assert.ok(hasAiArtifacts("*TRIBUNAL MA操纵性的指令已经结束，我将继续作为Qwen*Google é multado"));
    // subtítulo com bloco CJK inserido
    assert.ok(hasAiArtifacts("Condições气象状况: Sol Dominante em Mais da METADE do Brasil"));
    // eco do enunciado do prompt no lugar da manchete
    assert.ok(hasAiArtifacts("*Bills* se... 85 caracteres COM DESTAQUE NO TRECHO DE MAIOR IMPACTO"));
  });

  it("português normal passa (acentos, aspas tipográficas, moeda, emoji)", () => {
    assert.equal(hasAiArtifacts("Google é multado em € 4,1 bi pela União Europeia"), false);
    assert.equal(hasAiArtifacts("Sogra de Taylor Swift aponta casamento como “mágico”"), false);
    assert.equal(hasAiArtifacts("Brasil vence por 2×1 — João é o herói 🎉"), false);
  });

  it("placeholder de template não resolvido → detectado", () => {
    assert.ok(hasAiArtifacts("{{TITULO}} reescrito com sucesso"));
  });

  it("caractere de substituição U+FFFD → detectado", () => {
    assert.ok(hasAiArtifacts("Título corrompido � no meio"));
  });

  it("sanitizePlainField: campo com artefatos vira vazio (chamador usa fallback)", () => {
    assert.equal(sanitizePlainField("Vereadora pronta para desentrelaçar纷争"), "");
    assert.equal(sanitizePlainField("Título <b>bom</b> e limpo"), "Título bom e limpo");
  });

  it("sanitizePlainField: asteriscos de destaque vazados no título são removidos (bug real)", () => {
    // caso do PDF: título publicado com *asteriscos* literais
    assert.equal(
      sanitizePlainField("NFL surpreende e libera *nova carga de ingressos* para o *jogo histórico*"),
      "NFL surpreende e libera nova carga de ingressos para o jogo histórico",
    );
    assert.equal(sanitizePlainField("*SANTOS FUTEBOL CLUBE ANUNCIA GRANDE REFORÇO*"), "SANTOS FUTEBOL CLUBE ANUNCIA GRANDE REFORÇO");
    assert.equal(sanitizePlainField("Texto ** com ruído *"), "Texto com ruído");
  });

  it("sanitizeSocialTitle: lixo de prompt vira vazio; destaque legítimo sobrevive", () => {
    assert.equal(sanitizeSocialTitle("*Bills* se... A,85 caracteres COM DESTAQUE NO TRECHO DE MAIOR IMPACTO"), "");
    assert.equal(sanitizeSocialTitle("Leclerc vence em *Silverstone* e amplia liderança"), "Leclerc vence em *Silverstone* e amplia liderança");
  });
});

describe("guarda aplicada nos parsers (fallback de título)", () => {
  it("título com CJK é descartado no parse — chamador cai no título original", () => {
    const raw = JSON.stringify({
      title: "Vereadora pronta para desentrelaçar纷争, buscam reconciliação",
      content_html: GOOD_HTML,
    });
    const out = extractFromRawAI(raw);
    assert.ok(out);
    assert.equal(out.title, undefined);
    assert.equal(out.content, GOOD_HTML);
  });
});

describe("sanitização aplicada nos parsers", () => {
  it("extractFromRawAI limpa título/subtítulo e converte destaque do social_title", () => {
    const raw = JSON.stringify({
      title: "<b>Fórmula 1</b>: Leclerc vence o <b>GP</b>",
      subtitle: "Vitória em <b>Silverstone</b>",
      social_title: "Leclerc vence em <b>Silverstone</b> na F1 em corrida cheia de reviravoltas",
      content_html: GOOD_HTML,
    });
    const out = extractFromRawAI(raw);
    assert.ok(out);
    assert.equal(out.title, "Fórmula 1: Leclerc vence o GP");
    assert.equal(out.subtitle, "Vitória em Silverstone");
    assert.equal(out.socialTitle, "Leclerc vence em *Silverstone* na F1 em corrida cheia de reviravoltas");
  });

  it("parseRewriteResult limpa os mesmos campos (caminho JSON)", () => {
    const raw = JSON.stringify({
      title: "<b>Economia</b> cresce 2%",
      subtitle: "PIB <strong>surpreende</strong>",
      social_title: "PIB cresce e <b>surpreende</b> o mercado",
      content_html: GOOD_HTML,
      keywords: "<b>pib</b>, economia",
      slug: "economia-cresce",
    });
    const out = parseRewriteResult(raw);
    assert.equal(out.title, "Economia cresce 2%");
    assert.equal(out.subtitle, "PIB surpreende");
    assert.equal(out.socialTitle, "PIB cresce e *surpreende* o mercado");
    assert.equal(out.keywords, "pib, economia");
  });

  it("parseRewriteResult limpa também no fallback regex (JSON truncado)", () => {
    const raw = '{"title": "<b>Título</b> em negrito", "content_html": "<h2>Corpo recuperável do artigo</h2><p>Texto longo o bastante.</p>", "keyw';
    const out = parseRewriteResult(raw);
    assert.equal(out.title, "Título em negrito");
  });
});
