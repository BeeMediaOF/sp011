import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseUtm, refHostOf, contentScrollPct, newMilestones, createDwellDecider,
  externalHrefOf, createLinkClickDebouncer, hasAdminPreviewParam, newSharePlatforms,
} from "./analyticsClient";

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

test("externalHrefOf: só http(s) de outro origin; mailto/tel/relativo/inválido = null (RF2)", () => {
  const origin = "https://blog.com";
  assert.equal(externalHrefOf("https://externo.com/x", origin), "https://externo.com/x");
  assert.equal(externalHrefOf("http://externo.com/x", origin), "http://externo.com/x");
  assert.equal(externalHrefOf("https://blog.com/artigo/1", origin), null); // mesmo origin
  assert.equal(externalHrefOf("mailto:a@b.c", origin), null);
  assert.equal(externalHrefOf("tel:+5561999", origin), null);
  assert.equal(externalHrefOf("javascript:void(0)", origin), null);
  assert.equal(externalHrefOf("/relativo", origin), null);       // sem protocolo → inválido p/ URL()
  assert.equal(externalHrefOf("#hash", origin), null);
  assert.equal(externalHrefOf("não é url", origin), null);
  // prefixo enganoso: subdomínio .evil de outra origin CONTA (comparação de origin real, não string)
  assert.equal(externalHrefOf("https://blog.com.evil.com/x", origin), "https://blog.com.evil.com/x");
  // mesmo host, protocolo diferente → origins distintos → conta
  assert.equal(externalHrefOf("http://blog.com/x", origin), "http://blog.com/x");
});

test("createLinkClickDebouncer: mesmo href <1s = 1×; >1s = conta; href diferente conta na hora (RF2)", () => {
  let now = 0;
  const d = createLinkClickDebouncer(1000, () => now);
  assert.equal(d.shouldCount("https://a.com"), true);   // 1ª vez
  now = 500;
  assert.equal(d.shouldCount("https://a.com"), false);  // dentro de 1s do último contado
  now = 700;
  assert.equal(d.shouldCount("https://b.com"), true);   // href diferente conta imediatamente
  now = 1000;
  assert.equal(d.shouldCount("https://a.com"), true);   // 1000ms desde o último "a" contado (t=0)
});

test("hasAdminPreviewParam: só ?adminPreview=1; malformado não lança (RF5)", () => {
  assert.equal(hasAdminPreviewParam("?adminPreview=1"), true);
  assert.equal(hasAdminPreviewParam("?x=2&adminPreview=1&y=3"), true);
  assert.equal(hasAdminPreviewParam("?adminPreview=0"), false);
  assert.equal(hasAdminPreviewParam("?adminPreview=true"), false);
  assert.equal(hasAdminPreviewParam(""), false);
  assert.equal(hasAdminPreviewParam("?x=1"), false);
});

test("newSharePlatforms: plataforma nova = [plataforma]; repetida = [] (RF4)", () => {
  assert.deepEqual(newSharePlatforms("facebook", new Set()), ["facebook"]);
  assert.deepEqual(newSharePlatforms("facebook", new Set(["facebook"])), []);
  assert.deepEqual(newSharePlatforms("copy", new Set(["facebook"])), ["copy"]);
  assert.deepEqual(newSharePlatforms("copy", new Set(["facebook", "copy"])), []);
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
