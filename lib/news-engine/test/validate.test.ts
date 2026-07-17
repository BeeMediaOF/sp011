import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fidelityReport, qualityScore } from "../src/score.ts";
import { validateRewrite, type ValidationIssue } from "../src/validate.ts";
import type { ExtractedAI } from "../src/quality.ts";

const FONTE_ARSENAL = "Arsenal encaminha acerto com Tzolis para repor saída de Gabriel Martinelli";

/** Corpo válido: >700 chars visíveis, com FAQ e sem <h1>. */
function corpoValido(extra = ""): string {
  const p = "<p>" + "Parágrafo com conteúdo editorial suficiente para o leitor. ".repeat(3) + "</p>";
  return (
    "<h2>Subtítulo da matéria com contexto</h2>" + p + p + p +
    "<h3>Detalhes da negociação</h3>" + p + p +
    "<h2>Perguntas Frequentes</h2><h3>O que muda?</h3><p>Resposta direta.</p>" +
    extra
  );
}

function reescritaOk(patch?: Partial<ExtractedAI>): ExtractedAI {
  return {
    content: corpoValido(),
    title: "Arsenal encaminha acerto com Tzolis para substituir Martinelli no ataque",
    subtitle: "Clube inglês avança nas bases salariais com o atacante grego e prepara anúncio para os próximos dias da janela.",
    socialTitle: "ARSENAL ENCAMINHA *ACERTO COM TZOLIS* E DEFINE SUBSTITUTO DE MARTINELLI NO ATAQUE",
    keywords: "arsenal, tzolis, martinelli, premier league",
    slug: "arsenal-acerto-tzolis-martinelli",
    ...patch,
  };
}

function codes(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.code).sort();
}

describe("fidelityReport (cobertura contínua + números inventados)", () => {
  it("reescrita fiel → cobertura alta, sem números inventados", () => {
    const r = fidelityReport(
      "Arsenal avança por Tzolis: grego encaminha acerto e chega para repor a saída de Gabriel Martinelli",
      FONTE_ARSENAL,
    );
    assert.ok(r.coverage >= 80, `coverage ${r.coverage}`);
    assert.deepEqual(r.inventedNumbers, []);
  });

  it("alucinação (Três Moços) → cobertura baixa", () => {
    const r = fidelityReport(
      "NOVA LINHA NA HISTÓRIA: PONTES DE TRÊS MOÇOS ABRIRÁ. Prefeitura anuncia investimento recorde em Curitiba.",
      FONTE_ARSENAL,
    );
    assert.ok(r.coverage <= 20, `coverage ${r.coverage}`);
  });

  it("número que não existe na fonte é flagrado (placar/valor)", () => {
    const r = fidelityReport(
      "Arsenal fecha com Tzolis por 45 milhões de euros após vencer por 3 a 1",
      FONTE_ARSENAL,
    );
    assert.ok(r.inventedNumbers.includes("45"));
    assert.ok(r.inventedNumbers.includes("3"));
    assert.ok(r.inventedNumbers.includes("1"));
  });

  it("números presentes na fonte (dígito e por extenso) não são flagrados", () => {
    const r = fidelityReport(
      "São Paulo confirma 5 casos e investe R$ 1.200 na campanha de 2026",
      "São Paulo confirma cinco casos; investimento de 1200 reais aprovado para 2026",
    );
    assert.deepEqual(r.inventedNumbers, []);
  });

  it("baseline dos números usa o material COMPLETO quando fornecido", () => {
    const r = fidelityReport(
      "Arsenal fecha com Tzolis por 45 milhões",
      FONTE_ARSENAL,
      FONTE_ARSENAL + " O clube pagará 45 milhões de euros ao Club Brugge.",
    );
    assert.deepEqual(r.inventedNumbers, []);
  });

  it("fonte sem termo distintivo → cobertura 100 (não dá para julgar)", () => {
    const r = fidelityReport("Qualquer texto", "de o a e");
    assert.equal(r.totalTokens, 0);
    assert.equal(r.coverage, 100);
  });
});

describe("qualityScore (fidelidade dominante)", () => {
  it("cobertura alta e limpa → nota alta; cobertura baixa → nota baixa", () => {
    const alto = qualityScore({ coverage: 95, inventedNumbers: [], issues: [] });
    const baixo = qualityScore({ coverage: 10, inventedNumbers: [], issues: [] });
    assert.ok(alto >= 90, `alto=${alto}`);
    assert.ok(baixo <= 50, `baixo=${baixo}`);
    assert.ok(alto - baixo >= 40);
  });

  it("números inventados penalizam mais que warns", () => {
    const comInventado = qualityScore({ coverage: 90, inventedNumbers: ["45", "3"], issues: [] });
    const comWarns = qualityScore({
      coverage: 90, inventedNumbers: [],
      issues: [{ severity: "warn" }, { severity: "warn" }],
    });
    assert.ok(comInventado < comWarns);
  });

  it("issue block derruba a nota e o resultado fica em 0-100", () => {
    const s = qualityScore({
      coverage: 0, inventedNumbers: ["1", "2", "3", "4"],
      issues: [{ severity: "block" }, { severity: "block" }, { severity: "block" }],
    });
    assert.ok(s >= 0 && s <= 100);
    assert.equal(s, 0);
  });
});

describe("validateRewrite (validação estrutural em código)", () => {
  it("reescrita no padrão → nenhum issue", () => {
    assert.deepEqual(validateRewrite(reescritaOk(), FONTE_ARSENAL), []);
  });

  it("título ausente/curto: block; fora do alvo: warn", () => {
    assert.ok(codes(validateRewrite(reescritaOk({ title: undefined }), FONTE_ARSENAL)).includes("title_missing"));
    const curto = validateRewrite(reescritaOk({ title: "Arsenal fecha" }), FONTE_ARSENAL);
    assert.equal(curto.find((i) => i.code === "title_short")?.severity, "block");
    const quaseLa = validateRewrite(reescritaOk({ title: "Arsenal encaminha acerto agora" }), FONTE_ARSENAL);
    assert.equal(quaseLa.find((i) => i.code === "title_short")?.severity, "warn");
  });

  it("corpo raso → block body_short", () => {
    const r = validateRewrite(reescritaOk({ content: "<p>toco</p>" }), FONTE_ARSENAL);
    assert.equal(r.find((i) => i.code === "body_short")?.severity, "block");
  });

  it("HTML perigoso → block (script, handler inline, javascript:)", () => {
    for (const mau of [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      '<a href="javascript:alert(1)">x</a>',
    ]) {
      const r = validateRewrite(reescritaOk({ content: corpoValido(mau) }), FONTE_ARSENAL);
      assert.equal(r.find((i) => i.code === "html_dangerous")?.severity, "block", mau);
    }
  });

  it("<h1> e FAQ ausente → warns", () => {
    const semFaq = corpoValido().replace("Perguntas Frequentes", "Mais Perguntas");
    const r = validateRewrite(reescritaOk({ content: "<h1>Título</h1>" + semFaq }), FONTE_ARSENAL);
    assert.ok(codes(r).includes("html_h1"));
    assert.ok(codes(r).includes("faq_missing"));
  });

  it("FAQ em inglês (blog EN) também conta", () => {
    const en = corpoValido().replace("Perguntas Frequentes", "Frequently Asked Questions");
    assert.ok(!codes(validateRewrite(reescritaOk({ content: en }), FONTE_ARSENAL)).includes("faq_missing"));
  });

  it("slug inválido e keywords ausentes → warns", () => {
    const r = validateRewrite(
      reescritaOk({ slug: "Slug_Inválido!", keywords: undefined }),
      FONTE_ARSENAL,
    );
    assert.ok(codes(r).includes("slug_invalid"));
    assert.ok(codes(r).includes("keywords_missing"));
  });

  it("fonte publieditorial e em andamento → warns promo_content/live_updating", () => {
    const promo = validateRewrite(reescritaOk(), FONTE_ARSENAL + " Use o código promocional BET10.");
    assert.ok(codes(promo).includes("promo_content"));
    const live = validateRewrite(reescritaOk(), FONTE_ARSENAL + " Acompanhe AO VIVO a coletiva.");
    assert.ok(codes(live).includes("live_updating"));
  });

  it("subtitle fora da faixa de meta description → warn subtitle_len", () => {
    const r = validateRewrite(reescritaOk({ subtitle: "Curto demais." }), FONTE_ARSENAL);
    assert.ok(codes(r).includes("subtitle_len"));
  });
});
