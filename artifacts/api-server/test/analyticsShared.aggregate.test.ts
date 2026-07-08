import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWindowAggregates, brtDayStartMs, DAY, type EventLike } from "../src/lib/analyticsShared.ts";

// Janela fixa de 7 dias BRT: 01..07/07/2026.
const FROM = brtDayStartMs("2026-07-01");
const WIN = { fromMs: FROM, toMs: FROM + 7 * DAY };
const T = FROM + 2 * DAY + 5 * 3_600_000; // 03/07 dentro da janela

function pv(over: Partial<EventLike>): EventLike {
  return { type: "pageview", sessionId: "s1", ts: T, device: "desktop", path: "/", ...over };
}

test("pageviews: bucket do dia certo, sessões, bounce e evento fora da janela ignorado", () => {
  const agg = buildWindowAggregates([
    pv({ sessionId: "s1", path: "/a" }),
    pv({ sessionId: "s1", path: "/b" }),
    pv({ sessionId: "s2", path: "/a" }),
    pv({ sessionId: "s3", path: "/x", ts: FROM - 1 }), // antes da janela — fora
  ], WIN);

  assert.equal(agg.windowPv, 3);
  assert.equal(Object.keys(agg.byDay).length, 7);
  assert.equal(agg.byDay["2026-07-03"], 3);
  assert.equal(agg.sessionPageviews["s1"], 2); // não é bounce
  assert.equal(agg.sessionPageviews["s2"], 1); // bounce
  assert.equal(agg.sessionPageviews["s3"], undefined);
});

test("read: MAX cumulativo por sessão+página — heartbeats 30/60/90 valem 90, não a soma", () => {
  const agg = buildWindowAggregates([
    { type: "read", sessionId: "s1", path: "/a", articleId: "art1", duration: 30, ts: T },
    { type: "read", sessionId: "s1", path: "/a", articleId: "art1", duration: 60, ts: T + 30_000 },
    { type: "read", sessionId: "s1", path: "/a", articleId: "art1", duration: 90, ts: T + 60_000 },
    // linha legada (total único de uma visita antiga) convive com heartbeats
    { type: "read", sessionId: "s2", path: "/a", articleId: "art1", duration: 120, ts: T },
    // acima do teto de 30min → clampa em 1800
    { type: "read", sessionId: "s3", path: "/b", duration: 99_999, ts: T },
  ], WIN);

  assert.equal(agg.readMax.get("s1|/a"), 90);
  assert.equal(agg.readMax.get("s2|/a"), 120);
  assert.equal(agg.readMax.get("s3|/b"), 1800);
  assert.equal(agg.articleReadMax.get("art1|s1"), 90);
  assert.equal(agg.articleReadMax.get("art1|s2"), 120);
});

test("scroll: cada marco vale 1× por sessão+artigo (evento repetido não soma)", () => {
  const agg = buildWindowAggregates([
    { type: "scroll", sessionId: "s1", articleId: "art1", scrollDepth: 50, ts: T, path: "/a" },
    { type: "scroll", sessionId: "s1", articleId: "art1", scrollDepth: 50, ts: T + 1000, path: "/a" },
    { type: "scroll", sessionId: "s2", articleId: "art1", scrollDepth: 50, ts: T, path: "/a" },
    { type: "scroll", sessionId: "s2", articleId: "art1", scrollDepth: 100, ts: T, path: "/a" },
  ], WIN);

  assert.equal(agg.scrollSessions[50]?.size, 2);
  assert.equal(agg.scrollSessions[100]?.size, 1);
  assert.equal(agg.scrollSessions[25]?.size, 0);
});

test("canais: remap do legado 'outro' → referencia; refHost/campanha rankeados", () => {
  const agg = buildWindowAggregates([
    pv({ sessionId: "s1", referrer: "outro" }),
    pv({ sessionId: "s2", referrer: "busca" }),
    pv({ sessionId: "s3", referrer: "email", refHost: "blogx.com", utmCampaign: "verao" }),
  ], WIN);

  assert.equal(agg.channelMap["referencia"], 1);
  assert.equal(agg.channelMap["busca"], 1);
  assert.equal(agg.channelMap["email"], 1);
  assert.equal(agg.channelMap["direto"], 0);
  assert.equal(agg.refHostMap["blogx.com"], 1);
  assert.equal(agg.campaignMap["verao"], 1);
});

test("artigos/categorias/share/dispositivos agregam na janela", () => {
  const agg = buildWindowAggregates([
    pv({ sessionId: "s1", articleId: "art1", title: "Título", category: "politica", device: "mobile" }),
    { type: "category", sessionId: "s1", category: "politica", ts: T, path: "/" },
    { type: "share", sessionId: "s1", platform: "whatsapp", ts: T, path: "/" },
  ], WIN);

  assert.equal(agg.articleMap["art1"]?.views, 1);
  assert.equal(agg.articleMap["art1"]?.title, "Título");
  assert.equal(agg.catViewMap["politica"], 1);
  assert.equal(agg.catClickMap["politica"], 1);
  assert.equal(agg.shareMap["whatsapp"], 1);
  assert.equal(agg.deviceMap["mobile"], 1);
});

test("janela vazia: shapes zerados, nada de undefined/NaN", () => {
  const agg = buildWindowAggregates([], WIN);
  assert.equal(agg.windowPv, 0);
  assert.equal(Object.keys(agg.byDay).length, 7);
  assert.ok(Object.values(agg.byDay).every((v) => v === 0));
  assert.equal(agg.readMax.size, 0);
  assert.equal(agg.byHour.length, 24);
  assert.equal(agg.byDow.length, 7);
});
