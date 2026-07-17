import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAuditResponse } from "../src/ai/audit.ts";
import { extractCategoryConfidence, extractCategoryReason } from "../src/ai/rewrite.ts";

describe("parseAuditResponse (IA Auditora)", () => {
  it("JSON limpo aprovado → tudo ok", () => {
    const out = parseAuditResponse(
      '{"invented": false, "title_ok": true, "contradiction": false, "exaggeration": false, "publishable": true, "notes": ""}',
    );
    assert.equal(out.publishable, true);
    assert.equal(out.invented, false);
    assert.equal(out.notes, undefined);
  });

  it("cerca markdown + invenção → reprovado com notes", () => {
    const out = parseAuditResponse(
      '```json\n{"invented": true, "title_ok": true, "contradiction": false, "exaggeration": false, "publishable": false, "notes": "Valor de R$ 45 mi não existe na fonte."}\n```',
    );
    assert.equal(out.invented, true);
    assert.equal(out.publishable, false);
    assert.ok(out.notes?.includes("45 mi"));
  });

  it("resposta sem publishable → lança (inconclusiva)", () => {
    assert.throws(() => parseAuditResponse("A matéria parece boa."));
    assert.throws(() => parseAuditResponse('{"invented": false}'));
  });

  it("campos ausentes assumem o lado seguro (não inventado, título ok)", () => {
    const out = parseAuditResponse('{"publishable": true}');
    assert.equal(out.invented, false);
    assert.equal(out.titleOk, true);
    assert.equal(out.contradiction, false);
  });
});

describe("extractCategoryConfidence / extractCategoryReason (classificador)", () => {
  it("confidence do classificador e category_confidence da tradução", () => {
    assert.equal(extractCategoryConfidence('{"category": "futebol", "confidence": 92, "reason": "tema"}'), 92);
    assert.equal(extractCategoryConfidence('{"category": "credito", "category_confidence": 55}'), 55);
    assert.equal(extractCategoryConfidence('{"confidence": "88"}'), 88);
  });

  it("ausente/inválida → undefined; fora da faixa → clamp", () => {
    assert.equal(extractCategoryConfidence('{"category": "futebol"}'), undefined);
    assert.equal(extractCategoryConfidence('{"confidence": 999}'), 100);
  });

  it("reason extraída e limitada", () => {
    assert.equal(
      extractCategoryReason('{"category": "score", "confidence": 80, "reason": "fala de pontuação de crédito"}'),
      "fala de pontuação de crédito",
    );
    assert.equal(extractCategoryReason('{"category": "score"}'), undefined);
  });
});
