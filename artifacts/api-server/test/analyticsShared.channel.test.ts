import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChannel, normalizeLegacyChannel, matchesPaidCampaign,
  brtDayKey, type PaidCampaign,
} from "../src/lib/analyticsShared.ts";

const TODAY = brtDayKey(Date.now());

// PRD 05 CA-1: sem campanha cadastrada, NENHUMA combinação de sinais vira "pago".
test("PRD 05 CA-1: campaigns=[] nunca classifica 'pago' (matriz de sinais)", () => {
  const mediums = [undefined, "cpc", "ppc", "paid", "display", "cpm", "banner", "retargeting", "social", "email"];
  const hosts = [undefined, "google.com", "facebook.com", "parceiro.com.br"];
  const clickIds = [{}, { paidClick: true }, { gclid: true }, { fbclid: true }, { gclid: true, fbclid: true }];
  for (const utmMedium of mediums) {
    for (const refHost of hosts) {
      for (const cid of clickIds) {
        for (const utmSource of [undefined, "meta"]) {
          const r = classifyChannel({ utmMedium, refHost, utmSource, ...cid });
          assert.notEqual(r, "pago", `m=${utmMedium} host=${refHost} src=${utmSource} ${JSON.stringify(cid)}`);
        }
      }
    }
  }
});

// PRD 05 CA-2: click-id órfão classifica por host/plataforma, nunca pago.
test("PRD 05 CA-2: click-id sem campanha -> social/busca (host ou R5)", () => {
  assert.equal(classifyChannel({ fbclid: true, refHost: "facebook.com" }), "social");
  assert.equal(classifyChannel({ gclid: true, refHost: "google.com" }), "busca");
  assert.equal(classifyChannel({ fbclid: true }), "social");           // R5: sem host
  assert.equal(classifyChannel({ gclid: true }), "busca");             // R5: sem host
  assert.equal(classifyChannel({ paidClick: true }), "desconhecido");  // legado fundido, sem plataforma
});

// PRD 05 CA-3: campanha ativa casando por cada identificador isolado -> pago.
test("PRD 05 CA-3: campanha ativa casa (utm_campaign / par source+medium / gclid / fbclid)", () => {
  const base: PaidCampaign = { id: "c1", name: "x", active: true };
  assert.equal(classifyChannel({ utmCampaign: "BLACK-friday" }, [{ ...base, utmCampaign: "black-friday" }], TODAY), "pago");
  assert.equal(classifyChannel({ utmSource: "meta", utmMedium: "cpc" }, [{ ...base, utmSource: "meta", utmMedium: "cpc" }], TODAY), "pago");
  assert.equal(classifyChannel({ gclid: true }, [{ ...base, acceptGclid: true }], TODAY), "pago");
  assert.equal(classifyChannel({ fbclid: true }, [{ ...base, acceptFbclid: true }], TODAY), "pago");
});

test("PRD 05 CA-3: inativa / fora do período / sem identificador NÃO casa", () => {
  const sig = { utmCampaign: "promo" };
  assert.notEqual(classifyChannel(sig, [{ id: "c", name: "x", active: false, utmCampaign: "promo" }], TODAY), "pago");
  assert.notEqual(classifyChannel(sig, [{ id: "c", name: "x", active: true, utmCampaign: "promo", endDay: "2020-01-01" }], TODAY), "pago");
  assert.notEqual(classifyChannel(sig, [{ id: "c", name: "x", active: true, utmCampaign: "promo", startDay: "2999-01-01" }], TODAY), "pago");
  // campanha sem identificador nunca casa (fbclid cai em social por R5)
  assert.equal(classifyChannel({ fbclid: true }, [{ id: "c", name: "x", active: true }], TODAY), "social");
});

test("PRD 05: matchesPaidCampaign — janela BRT inclusiva, identificador vazio e datas inválidas", () => {
  const c: PaidCampaign = { id: "c", name: "x", active: true, utmCampaign: "promo", startDay: "2026-07-01", endDay: "2026-07-31" };
  assert.equal(matchesPaidCampaign({ utmCampaign: "promo" }, c, "2026-07-01"), true);
  assert.equal(matchesPaidCampaign({ utmCampaign: "promo" }, c, "2026-07-31"), true);
  assert.equal(matchesPaidCampaign({ utmCampaign: "promo" }, c, "2026-06-30"), false);
  assert.equal(matchesPaidCampaign({ utmCampaign: "promo" }, c, "2026-08-01"), false);
  // identificador em branco não casa
  assert.equal(matchesPaidCampaign({ utmCampaign: "" }, { id: "c", name: "x", active: true, utmCampaign: "" }, "2026-07-10"), false);
  // datas malformadas = sem limite
  assert.equal(matchesPaidCampaign({ utmCampaign: "p" }, { id: "c", name: "x", active: true, utmCampaign: "p", startDay: "lixo", endDay: "" }, "2026-07-10"), true);
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
