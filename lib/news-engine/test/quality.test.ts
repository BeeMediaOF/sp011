import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestSocialTitle,
  extractFromRawAI,
  isContentRenderable,
  plainTextLength,
  rewriteMatchesSource,
  socialTitleFromTitle,
  socialTitleMatchesSource,
} from "../src/quality.ts";

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

describe("plainTextLength", () => {
  it("conta só o texto visível (sem tags, entidades e espaços repetidos)", () => {
    assert.equal(plainTextLength("<p>abc</p>"), 3);
    assert.equal(plainTextLength("<h2>ab</h2>\n\n<p>cd&nbsp;ef</p>"), "ab cd ef".length);
    assert.equal(plainTextLength(""), 0);
    assert.equal(plainTextLength("<div><img src='x'/></div>"), 0);
  });
});

describe("socialTitleMatchesSource (guarda de palavra inventada)", () => {
  const SOURCE = "Espanha garante vaga na final com apenas um gol sofrido. A defesa espanhola foi impecável na semifinal.";

  it("caso real do incidente: 'garantivaga' não existe no material → reprova", () => {
    assert.equal(socialTitleMatchesSource("Espanha garantivaga na final com apenas um gol sofrido", SOURCE), false);
  });

  it("manchete com palavras do material passa (caixa/acentos ignorados)", () => {
    assert.equal(socialTitleMatchesSource("ESPANHA GARANTE VAGA NA FINAL", SOURCE), true);
    assert.equal(socialTitleMatchesSource("Defesa ESPANHOLA impecável na *semifinal*", SOURCE), true);
  });

  it("palavras curtas (≤4 letras) e números são ignorados", () => {
    assert.equal(socialTitleMatchesSource("Gol aos 90: Espanha na final", SOURCE), true);
  });
});

describe("socialTitleFromTitle / bestSocialTitle", () => {
  it("título curto passa inteiro; longo corta em palavra", () => {
    assert.equal(socialTitleFromTitle("Título curto"), "Título curto");
    const longo = "Palavra ".repeat(20).trim(); // 159 chars
    const out = socialTitleFromTitle(longo);
    assert.ok(out.length <= 85);
    assert.ok(!out.endsWith("Palavr")); // não corta no meio
  });

  it("manchete suja cai no título; manchete limpa é mantida", () => {
    const title = "Espanha garante vaga na final";
    const source = `${title}\nA defesa segurou o resultado.`;
    assert.equal(bestSocialTitle("Espanha garantivaga na final", title, source), title);
    assert.equal(bestSocialTitle("ESPANHA GARANTE VAGA", title, source), "ESPANHA GARANTE VAGA");
    assert.equal(bestSocialTitle(null, title, source), title);
    assert.equal(bestSocialTitle("", "", ""), null);
  });
});

describe("rewriteMatchesSource (gate anti-alucinação)", () => {
  const FONTE_ARSENAL = "Arsenal encaminha acerto com Tzolis para repor saída de Gabriel Martinelli";

  it("reescrita inventada do zero (incidente Três Moços) → reprovada", () => {
    const alucinada = "NOVA LINHA NA HISTÓRIA: PONTES DE TRÊS MOÇOS ABRIRÁ " +
      "Prefeitura anuncia investimento recorde para melhorar acesso do município a Curitiba; " +
      "obra vai impactar 12 mil moradores e gerar 300 empregos diretos.";
    assert.equal(rewriteMatchesSource(alucinada, FONTE_ARSENAL), false);
  });

  it("reescrita fiel (mantém entidades do original) → aprovada", () => {
    const fiel = "Arsenal avança por Tzolis: grego é o alvo para o lugar de Martinelli. " +
      "O clube inglês encaminhou as bases salariais com o atacante.";
    assert.equal(rewriteMatchesSource(fiel, FONTE_ARSENAL), true);
  });

  it("comparação ignora acentos e caixa", () => {
    assert.equal(rewriteMatchesSource(
      "SAO PAULO ANUNCIA NOVA LINHA DE METRO com estações na zona leste",
      "São Paulo anuncia nova linha de metrô",
    ), true);
  });

  it("stopwords em comum não contam como relação", () => {
    // "sobre", "depois", "ainda" aparecem nos dois, mas nenhum termo distintivo
    assert.equal(rewriteMatchesSource(
      "Governo fala sobre impostos e ainda avalia mudanças depois do feriado",
      "Flamengo vence sobre o Palmeiras e ainda sonha com o título depois da rodada",
    ), false);
  });

  it("original com 1 termo distintivo exige só esse termo", () => {
    assert.equal(rewriteMatchesSource("O Corinthians venceu de virada", "Corinthians hoje"), true);
    assert.equal(rewriteMatchesSource("O Flamengo venceu de virada", "Corinthians hoje"), false);
  });

  it("original sem termo distintivo (não dá para julgar) → passa", () => {
    assert.equal(rewriteMatchesSource("Qualquer texto reescrito", ""), true);
    assert.equal(rewriteMatchesSource("Qualquer texto reescrito", "de o a e"), true);
  });
});
