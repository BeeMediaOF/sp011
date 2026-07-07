import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TRANSLATION_ATTEMPTS,
  TRANSLATION_BACKOFF_MINUTES,
  isProviderUnavailableError,
  needsClassification,
  needsTranslation,
  postLocalizationStatus,
  resolveDeliveryCategory,
  translationBackoffMs,
} from "../src/lib/localization.ts";

describe("needsTranslation", () => {
  it("blog en × reescrita pt-BR → traduz", () => {
    assert.equal(needsTranslation("en", "pt-BR"), true);
  });
  it("blog en × reescrita en → não traduz (EN→EN nunca gasta IA)", () => {
    assert.equal(needsTranslation("en", "en"), false);
  });
  it("reescrita legado (language null) conta como pt-BR", () => {
    assert.equal(needsTranslation("pt-BR", null), false);
    assert.equal(needsTranslation("pt-BR", undefined), false);
    assert.equal(needsTranslation("en", null), true);
  });
});

describe("needsClassification", () => {
  const cats = [{ slug: "football" }, { slug: "others" }];
  it("blog com taxonomia e sem targetCategory → classifica", () => {
    assert.equal(needsClassification(cats, null), true);
  });
  it("regra com targetCategory explícito vence (não chama IA)", () => {
    assert.equal(needsClassification(cats, "football"), false);
  });
  it("blog sem taxonomia → comportamento atual (nada de classificação)", () => {
    assert.equal(needsClassification(null, null), false);
    assert.equal(needsClassification([], null), false);
  });
});

describe("resolveDeliveryCategory (precedência)", () => {
  const cats = [{ slug: "football" }, { slug: "nfl" }, { slug: "others" }];
  it("1º: categoria da regra sempre vence", () => {
    assert.equal(
      resolveDeliveryCategory({ ruleCategory: "nfl", aiCategory: "football", categories: cats }),
      "nfl",
    );
  });
  it("2º: categoria da IA quando válida na taxonomia", () => {
    assert.equal(
      resolveDeliveryCategory({ ruleCategory: null, aiCategory: "football", categories: cats }),
      "football",
    );
  });
  it("IA devolvendo slug fora da lista cai no fallback", () => {
    assert.equal(
      resolveDeliveryCategory({ ruleCategory: null, aiCategory: "basquete", categories: cats }),
      "others",
    );
  });
  it("3º: indecisão → others", () => {
    assert.equal(
      resolveDeliveryCategory({ ruleCategory: null, aiCategory: null, categories: cats }),
      "others",
    );
  });
  it("sem 'others' na lista → último slug", () => {
    assert.equal(
      resolveDeliveryCategory({
        ruleCategory: null, aiCategory: null,
        categories: [{ slug: "football" }, { slug: "tennis" }],
      }),
      "tennis",
    );
  });
  it("blog sem taxonomia → null (ingest usa a categoria da notícia)", () => {
    assert.equal(resolveDeliveryCategory({ ruleCategory: null, aiCategory: null, categories: null }), null);
    assert.equal(resolveDeliveryCategory({ ruleCategory: null, aiCategory: null, categories: [] }), null);
  });
});

describe("postLocalizationStatus", () => {
  it("localiza ANTES da aprovação: requireApproval → awaiting_approval", () => {
    assert.equal(postLocalizationStatus(true), "awaiting_approval");
    assert.equal(postLocalizationStatus(false), "pending");
  });
});

describe("translationBackoffMs", () => {
  it("escala 1m → 5m → 15m e clampa fora do intervalo", () => {
    assert.equal(translationBackoffMs(1), 60_000);
    assert.equal(translationBackoffMs(2), 5 * 60_000);
    assert.equal(translationBackoffMs(3), 15 * 60_000);
    assert.equal(translationBackoffMs(0), 60_000);
    assert.equal(translationBackoffMs(99), 15 * 60_000);
  });
  it("política cobre exatamente MAX_TRANSLATION_ATTEMPTS", () => {
    assert.equal(TRANSLATION_BACKOFF_MINUTES.length, MAX_TRANSLATION_ATTEMPTS);
  });
});

describe("isProviderUnavailableError", () => {
  it("quota/configuração não consomem tentativa", () => {
    assert.equal(isProviderUnavailableError("QUOTA_COOLDOWN: cota esgotada"), true);
    assert.equal(isProviderUnavailableError("Error: QUOTA_EXHAUSTED"), true);
    assert.equal(isProviderUnavailableError("API key da OpenAI não configurada"), true);
  });
  it("erro comum consome tentativa", () => {
    assert.equal(isProviderUnavailableError("Error: tradução ilegível (quality gate)"), false);
  });
});
