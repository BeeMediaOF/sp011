import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChannel, normalizeLegacyChannel } from "../src/lib/analyticsShared.ts";

test("pago: gclid/fbclid ou utm_medium pago vencem qualquer outro sinal", () => {
  assert.equal(classifyChannel({ paidClick: true }), "pago");
  assert.equal(classifyChannel({ utmMedium: "cpc" }), "pago");
  assert.equal(classifyChannel({ utmMedium: "display", refHost: "google.com" }), "pago");
});

test("email: utm_medium email/newsletter ou webmail como referrer", () => {
  assert.equal(classifyChannel({ utmMedium: "email" }), "email");
  assert.equal(classifyChannel({ utmMedium: "newsletter" }), "email");
  // gmail contém google.com — email precisa vencer busca
  assert.equal(classifyChannel({ refHost: "mail.google.com" }), "email");
});

test("busca: hosts de buscadores (inclui TLDs regionais e subdomínios)", () => {
  assert.equal(classifyChannel({ refHost: "google.com" }), "busca");
  assert.equal(classifyChannel({ refHost: "google.com.br" }), "busca");
  assert.equal(classifyChannel({ refHost: "news.google.com" }), "busca");
  assert.equal(classifyChannel({ refHost: "bing.com" }), "busca");
  assert.equal(classifyChannel({ utmMedium: "organic" }), "busca");
});

test("social: hosts de redes ou utm_medium social", () => {
  assert.equal(classifyChannel({ refHost: "facebook.com" }), "social");
  assert.equal(classifyChannel({ refHost: "m.facebook.com" }), "social");
  assert.equal(classifyChannel({ refHost: "t.co" }), "social");
  assert.equal(classifyChannel({ refHost: "youtu.be" }), "social");
  assert.equal(classifyChannel({ utmMedium: "social" }), "social");
});

test("referencia: host externo fora dos catálogos", () => {
  assert.equal(classifyChannel({ refHost: "blogdoparceiro.com.br" }), "referencia");
});

test("direto: nenhum sinal de origem", () => {
  assert.equal(classifyChannel({}), "direto");
});

test("desconhecido: UTM presente mas irreconhecível e sem referrer", () => {
  assert.equal(classifyChannel({ utmSource: "parceiro" }), "desconhecido");
  assert.equal(classifyChannel({ utmMedium: "coisaestranha" }), "desconhecido");
});

test("legado (bundle antigo do cliente): passa direto/busca/social; outro vira referencia", () => {
  assert.equal(classifyChannel({ legacyChannel: "direto" }), "direto");
  assert.equal(classifyChannel({ legacyChannel: "busca" }), "busca");
  assert.equal(classifyChannel({ legacyChannel: "social" }), "social");
  assert.equal(classifyChannel({ legacyChannel: "outro" }), "referencia");
});

test("normalizeLegacyChannel (remap SÓ na agregação, linhas nunca reescritas)", () => {
  assert.equal(normalizeLegacyChannel("outro"), "referencia");
  assert.equal(normalizeLegacyChannel("busca"), "busca");
  assert.equal(normalizeLegacyChannel("email"), "email");
  assert.equal(normalizeLegacyChannel("qualquercoisa"), "desconhecido");
});
