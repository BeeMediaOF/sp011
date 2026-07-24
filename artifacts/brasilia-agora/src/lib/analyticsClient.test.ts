import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUtm, refHostOf, contentScrollPct, newMilestones, createDwellDecider } from "./analyticsClient";

test("parseUtm: captura utm_* e presença de gclid/fbclid (o ID em si nunca sai)", () => {
  const u = parseUtm("?utm_source=nl&utm_medium=email&utm_campaign=julho");
  assert.equal(u.utmSource, "nl");
  assert.equal(u.utmMedium, "email");
  assert.equal(u.utmCampaign, "julho");
  assert.equal(u.paidClick, false);

  // PRD 05: gclid/fbclid vêm separados (paidClick mantido por retrocompat).
  const paid = parseUtm("?gclid=abc123xyz");
  assert.equal(paid.paidClick, true);
  assert.equal(paid.gclid, true);
  assert.equal(paid.fbclid, undefined);
  assert.equal(paid.utmSource, undefined);

  const fb = parseUtm("?fbclid=xyz");
  assert.equal(fb.paidClick, true);
  assert.equal(fb.fbclid, true);
  assert.equal(fb.gclid, undefined);

  assert.deepEqual(parseUtm(""), { paidClick: false });
});

test("refHostOf: hostname minúsculo sem www; inválido/vazio = undefined", () => {
  assert.equal(refHostOf("https://www.Google.com/search?q=x"), "google.com");
  assert.equal(refHostOf("https://m.facebook.com/perfil"), "m.facebook.com");
  assert.equal(refHostOf(""), undefined);
  assert.equal(refHostOf("isso não é url"), undefined);
});

test("contentScrollPct: relativo ao BLOCO de conteúdo, com clamp 0–100", () => {
  // conteúdo começa em 1000px e tem 2000px de altura
  assert.equal(contentScrollPct(900, 1000, 2000), 0);    // conteúdo ainda abaixo da viewport
  assert.equal(contentScrollPct(2000, 1000, 2000), 50);  // metade do corpo lida
  assert.equal(contentScrollPct(3000, 1000, 2000), 100); // fundo do corpo alcançado
  assert.equal(contentScrollPct(9999, 1000, 2000), 100); // rodapé/comentários não passam de 100
  assert.equal(contentScrollPct(0, 0, 0), 100);          // conteúdo sem altura = já visto
});

test("newMilestones: só marcos novos que o % atual alcançou", () => {
  assert.deepEqual(newMilestones(60, new Set([25])), [50]);
  assert.deepEqual(newMilestones(100, new Set()), [25, 50, 75, 100]);
  assert.deepEqual(newMilestones(24, new Set()), []);
  assert.deepEqual(newMilestones(75, new Set([25, 50, 75])), []);
});

test("dwell de impressão: 1s CONTÍNUO — sair da tela antes zera o relógio", () => {
  let now = 0;
  const d = createDwellDecider(1000, () => now);

  d.setVisible(true);            // entra na tela em t=0
  now = 500;
  assert.equal(d.shouldCount(), false); // passou rolando — não conta
  now = 1000;
  assert.equal(d.shouldCount(), true);  // 1s contínuo — impressão válida

  d.setVisible(false);           // saiu da tela
  now = 2000;
  d.setVisible(true);            // voltou em t=2000
  now = 2500;
  assert.equal(d.shouldCount(), false); // relógio recomeçou do zero
  now = 3000;
  assert.equal(d.shouldCount(), true);
});
