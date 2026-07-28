import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleEvent, type EventHandlerDeps, type AnalyticsEvent,
} from "../src/lib/ingestHandlers.ts";
import type { InternalReason } from "../src/lib/analyticsShared.ts";

// PRD 12 RF2/CA2 — L2: control-flow do POST /api/analytics/event com deps FAKE (sem
// Postgres, sem o setInterval de flush de routes/analytics.ts). Importa o HANDLER
// extraído, nunca o módulo de rota — por isso node --test ENCERRA. Cobre os ramos onde
// os bugs viveram (bot/rate/inválido/admin/duplicado/interno/first-touch).

const UA = "Mozilla/5.0 (X11; Linux x86_64) synthtest";  // não casa BOT_RE
const NOW = 1_770_000_000_000;

interface Recorded {
  health: string[];
  internalReasons: InternalReason[];
  pushed: AnalyticsEvent[];
  categoryViews: string[];
  articleViews: Array<[string, string]>;
  geoLookups: string[];
  geoBumps: number;
  noteEvents: number;
}

function makeDeps(overrides: Partial<EventHandlerDeps> = {}): { deps: EventHandlerDeps; rec: Recorded } {
  const rec: Recorded = {
    health: [], internalReasons: [], pushed: [], categoryViews: [],
    articleViews: [], geoLookups: [], geoBumps: 0, noteEvents: 0,
  };
  const deps: EventHandlerDeps = {
    now: () => NOW,
    overRateLimit: () => false,
    isRecentDuplicate: () => false,
    detectInternalRequest: () => ({ internal: false, reason: null }),
    activePaidCampaigns: () => [],
    bumpHealth: (k) => { rec.health.push(k); },
    bumpInternalReason: (r) => { rec.internalReasons.push(r); },
    noteEvent: () => { rec.noteEvents++; },
    getCachedGeo: () => undefined,
    bumpGeoViews: () => { rec.geoBumps++; },
    lookupGeoAsync: (ip) => { rec.geoLookups.push(ip); },
    pushEvent: (ev) => { rec.pushed.push(ev); },
    trackCategoryView: (c) => { rec.categoryViews.push(c); },
    trackArticleView: (a, t) => { rec.articleViews.push([a, t]); },
    ...overrides,
  };
  return { deps, rec };
}

test("bot user-agent → droppedBot, nada gravado", () => {
  const { deps, rec } = makeDeps();
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: "curl/8.4", body: { type: "pageview", path: "/", sessionId: "s1" } });
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.health, ["droppedBot"]);
  assert.equal(rec.pushed.length, 0);
});

test("acima do rate limit → droppedRate, nada gravado", () => {
  const { deps, rec } = makeDeps({ overRateLimit: () => true });
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body: { type: "pageview", path: "/", sessionId: "s1" } });
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.health, ["droppedRate"]);
  assert.equal(rec.pushed.length, 0);
});

test("payload sem type/path/sessionId → 400 + droppedInvalid", () => {
  for (const body of [{}, { path: "/", sessionId: "s" }, { type: "pageview", sessionId: "s" }, { type: "pageview", path: "/" }]) {
    const { deps, rec } = makeDeps();
    const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body });
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { ok: false });
    assert.deepEqual(rec.health, ["droppedInvalid"]);
    assert.equal(rec.pushed.length, 0);
  }
});

test("type inválido (fora de VALID_TYPES) → 400 droppedInvalid", () => {
  const { deps, rec } = makeDeps();
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body: { type: "click", path: "/", sessionId: "s" } });
  assert.equal(out.status, 400);
  assert.deepEqual(rec.health, ["droppedInvalid"]);
});

test("path /admin* → droppedInvalid, ok:true (200), sem gravar", () => {
  const { deps, rec } = makeDeps();
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body: { type: "pageview", path: "/admin/x", sessionId: "s" } });
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.health, ["droppedInvalid"]);
  assert.equal(rec.pushed.length, 0);
});

test("pageview duplicado (<15s) → droppedDuplicate, sem gravar", () => {
  const { deps, rec } = makeDeps({ isRecentDuplicate: () => true });
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body: { type: "pageview", path: "/", sessionId: "s" } });
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.health, ["droppedDuplicate"]);
  assert.equal(rec.pushed.length, 0);
});

test("category duplicado (<15s) → droppedDuplicate (chave cat:, PRD 03)", () => {
  const seen: string[] = [];
  const { deps, rec } = makeDeps({ isRecentDuplicate: (key) => { seen.push(key); return key.startsWith("cat:"); } });
  const out = handleEvent(deps, { ipRaw: "1.2.3.4", ua: UA, body: { type: "category", path: "/categoria/x", sessionId: "s" } });
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.health, ["droppedDuplicate"]);
  assert.ok(seen.some((k) => k === "cat:s|/categoria/x"));
});

test("interno → linha com is_internal=true, referrer='interno', flaggedInternal + razão", () => {
  const { deps, rec } = makeDeps({ detectInternalRequest: () => ({ internal: true, reason: "flag" }) });
  const out = handleEvent(deps, {
    ipRaw: "10.0.0.1", ua: UA,
    body: { type: "pageview", path: "/", sessionId: "s", firstTouch: true, articleId: "a1", title: "T" },
  });
  assert.deepEqual(out, { body: { ok: true } });
  assert.equal(rec.pushed.length, 1);
  const ev = rec.pushed[0]!;
  assert.equal(ev.isInternal, true);
  assert.equal(ev.referrer, "interno");            // interno vence a classificação (§17)
  assert.deepEqual(rec.internalReasons, ["flag"]);
  assert.ok(rec.health.includes("flaggedInternal"));
  assert.ok(rec.health.includes("received"));
  // Interno não infla contadores all-time nem geo.
  assert.equal(rec.articleViews.length, 0);
  assert.equal(rec.geoBumps, 0);
  assert.equal(rec.geoLookups.length, 0);
});

test("pageview público first-touch com utm_medium cru → classifyChannel + trackArticleView + geo", () => {
  const { deps, rec } = makeDeps();
  const out = handleEvent(deps, {
    ipRaw: "8.8.8.8", ua: UA,
    body: { type: "pageview", path: "/artigo/x", sessionId: "s", visitorId: "v1", articleId: "a1", title: "Titulo", utmMedium: "cpc", firstTouch: true },
  });
  assert.deepEqual(out, { body: { ok: true } });
  assert.equal(rec.pushed.length, 1);
  const ev = rec.pushed[0]!;
  assert.equal(ev.isInternal, false);
  assert.equal(ev.utmMedium, "cpc");               // sinal cru gravado
  assert.equal(typeof ev.referrer, "string");      // canal classificado no servidor
  assert.notEqual(ev.referrer, "interno");
  assert.equal(ev.ts, NOW);
  assert.deepEqual(rec.articleViews, [["a1", "Titulo"]]);
  assert.deepEqual(rec.geoLookups, ["8.8.8.8"]);   // sem geo em cache → lookup assíncrono
  assert.ok(rec.health.includes("received"));
  assert.equal(rec.noteEvents, 1);
});

test("category público → trackCategoryView (não trackArticleView)", () => {
  const { deps, rec } = makeDeps();
  handleEvent(deps, { ipRaw: "8.8.8.8", ua: UA, body: { type: "category", path: "/categoria/esportes", sessionId: "s", category: "esportes" } });
  assert.deepEqual(rec.categoryViews, ["esportes"]);
  assert.equal(rec.articleViews.length, 0);
});

test("geo em cache → bumpGeoViews em vez de lookup", () => {
  const { deps, rec } = makeDeps({ getCachedGeo: () => ({ city: "Brasília", region: "DF", country: "BR" }) });
  const out = handleEvent(deps, { ipRaw: "8.8.8.8", ua: UA, body: { type: "pageview", path: "/", sessionId: "s" } });
  const ev = rec.pushed[0]!;
  assert.equal(ev.city, "Brasília");
  assert.equal(rec.geoBumps, 1);
  assert.equal(rec.geoLookups.length, 0);
  assert.deepEqual(out, { body: { ok: true } });
});

test("hosting (geo de data center/Meta em cache) → is_internal=true, razão 'hosting', sem geo", () => {
  const { deps, rec } = makeDeps({ getCachedGeo: () => ({ city: "Luleå", region: "Norrbotten", country: "SE", hosting: true }) });
  const out = handleEvent(deps, {
    ipRaw: "57.144.0.1", ua: UA,
    body: { type: "pageview", path: "/", sessionId: "s", firstTouch: true, refHost: "facebook.com" },
  });
  assert.deepEqual(out, { body: { ok: true } });
  assert.equal(rec.pushed.length, 1);
  const ev = rec.pushed[0]!;
  assert.equal(ev.isInternal, true);
  assert.equal(ev.referrer, "interno");            // interno vence a classificação (§17)
  assert.deepEqual(rec.internalReasons, ["hosting"]);
  assert.ok(rec.health.includes("flaggedInternal"));
  assert.ok(rec.health.includes("received"));
  assert.equal(rec.geoBumps, 0);                   // hosting NÃO conta em geo
  assert.equal(rec.geoLookups.length, 0);          // já em cache
});

test("flag interna (admin) tem precedência sobre hosting na razão", () => {
  const { deps, rec } = makeDeps({
    detectInternalRequest: () => ({ internal: true, reason: "flag" }),
    getCachedGeo: () => ({ city: "Fort Worth", region: "Texas", country: "US", hosting: true }),
  });
  handleEvent(deps, { ipRaw: "57.144.0.1", ua: UA, body: { type: "pageview", path: "/", sessionId: "s" } });
  assert.deepEqual(rec.internalReasons, ["flag"]); // det.reason vence (hostingHit só quando !det.internal)
});
