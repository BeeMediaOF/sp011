import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleImpression, handleClick, type AdEventDeps,
} from "../src/lib/ingestHandlers.ts";
import type { InternalReason } from "../src/lib/analyticsShared.ts";

// PRD 12 RF2/CA2 — L2: control-flow de POST /api/ads/:id/impression e /click com deps
// FAKE (o SELECT/UPDATE do drizzle é injetado via selectAd/incrementAdAllTime). Cobre os
// pontos onde os bugs viveram: sem is_internal, sem dedup e o upsert do diário.

const UA = "Mozilla/5.0 (X11; Linux x86_64) synthtest";

interface Recorded {
  endpoint: Array<[string, string]>;   // (ep, key)
  internalReasons: InternalReason[];
  upserts: Array<[string, string, boolean]>;       // (adId, field, internal)
  increments: Array<[string, string]>;             // (id, field)
  selects: string[];
}

function makeDeps(overrides: Partial<AdEventDeps> = {}): { deps: AdEventDeps; rec: Recorded } {
  const rec: Recorded = { endpoint: [], internalReasons: [], upserts: [], increments: [], selects: [] };
  const deps: AdEventDeps = {
    overRateLimit: () => false,
    detectInternalRequest: () => ({ internal: false, reason: null }),
    bumpEndpoint: (ep, key) => { rec.endpoint.push([ep, key]); },
    bumpInternalReason: (r) => { rec.internalReasons.push(r); },
    dedupHit: () => false,
    findAdBlock: () => null,
    selectAd: async (id) => { rec.selects.push(id); return { active: true, expiresAt: null }; },
    incrementAdAllTime: async (id, field) => { rec.increments.push([id, field]); },
    upsertDailyStat: async (adId, field, internal) => { rec.upserts.push([adId, field, internal]); },
    ...overrides,
  };
  return { deps, rec };
}

const req = (adId: string, body: Record<string, unknown> = {}, ua = UA) =>
  ({ adId, ipRaw: "1.2.3.4", ua, body });

// ─── Impressão ────────────────────────────────────────────────────────────────
test("impressão: bot → droppedBot, nenhuma escrita", async () => {
  const { deps, rec } = makeDeps();
  const out = await handleImpression(deps, req("ad1", {}, "curl/8"));
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedBot"]]);
  assert.equal(rec.selects.length, 0);
  assert.equal(rec.upserts.length, 0);
});

test("impressão: acima do rate → droppedRate", async () => {
  const { deps, rec } = makeDeps({ overRateLimit: () => true });
  await handleImpression(deps, req("ad1"));
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedRate"]]);
  assert.equal(rec.upserts.length, 0);
});

test("impressão: dedup server-side → droppedDuplicate, sem escrita", async () => {
  const { deps, rec } = makeDeps({ dedupHit: () => true });
  await handleImpression(deps, req("ad1", { sessionId: "s1" }));
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedDuplicate"]]);
  assert.equal(rec.upserts.length, 0);
  assert.equal(rec.increments.length, 0);
});

test("impressão: bloco visível → upsert diário (block:), received", async () => {
  const { deps, rec } = makeDeps({ findAdBlock: () => ({ visible: true }) });
  const out = await handleImpression(deps, req("block:x"));
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.upserts, [["block:x", "impressions", false]]);
  assert.ok(rec.endpoint.some(([, k]) => k === "received"));
  assert.equal(rec.selects.length, 0);              // bloco não consulta a tabela ads
});

test("impressão: bloco invisível/ausente → droppedInvalid, sem upsert", async () => {
  for (const findAdBlock of [() => ({ visible: false }), () => null] as AdEventDeps["findAdBlock"][]) {
    const { deps, rec } = makeDeps({ findAdBlock });
    await handleImpression(deps, req("block:y"));
    assert.deepEqual(rec.endpoint, [["adImpression", "droppedInvalid"]]);
    assert.equal(rec.upserts.length, 0);
  }
});

test("impressão: anúncio inativo → droppedInvalid, sem incremento", async () => {
  const { deps, rec } = makeDeps({ selectAd: async () => ({ active: false, expiresAt: null }) });
  await handleImpression(deps, req("ad1"));
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedInvalid"]]);
  assert.equal(rec.increments.length, 0);
  assert.equal(rec.upserts.length, 0);
});

test("impressão: anúncio expirado → droppedInvalid", async () => {
  const { deps, rec } = makeDeps({ selectAd: async () => ({ active: true, expiresAt: new Date(Date.now() - 60_000) }) });
  await handleImpression(deps, req("ad1"));
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedInvalid"]]);
  assert.equal(rec.upserts.length, 0);
});

test("impressão: anúncio inexistente → droppedInvalid", async () => {
  const { deps, rec } = makeDeps({ selectAd: async () => undefined });
  await handleImpression(deps, req("ad1"));
  assert.deepEqual(rec.endpoint, [["adImpression", "droppedInvalid"]]);
});

test("impressão: caminho feliz público → incrementa all-time + upsert diário", async () => {
  const { deps, rec } = makeDeps();
  const out = await handleImpression(deps, req("ad1", { sessionId: "s1" }));
  assert.deepEqual(out, { body: { ok: true } });
  assert.deepEqual(rec.increments, [["ad1", "impressions"]]);
  assert.deepEqual(rec.upserts, [["ad1", "impressions", false]]);
  assert.ok(rec.endpoint.some(([, k]) => k === "received"));
});

test("impressão: interna → NÃO incrementa all-time; upsert com internal=true; flagged", async () => {
  const { deps, rec } = makeDeps({ detectInternalRequest: () => ({ internal: true, reason: "flag" }) });
  await handleImpression(deps, req("ad1", { sessionId: "s1", internal: true }));
  assert.equal(rec.increments.length, 0);                       // não infla o público
  assert.deepEqual(rec.upserts, [["ad1", "impressions", true]]);
  assert.deepEqual(rec.internalReasons, ["flag"]);
  assert.ok(rec.endpoint.some(([, k]) => k === "flaggedInternal"));
});

// ─── Clique ─────────────────────────────────────────────────────────────────
test("clique: caminho feliz → incrementa clicks + upsert; message", async () => {
  const { deps, rec } = makeDeps();
  const out = await handleClick(deps, req("ad1", { sessionId: "s1" }));
  assert.deepEqual(out, { body: { ok: true, message: "Click tracked" } });
  assert.deepEqual(rec.increments, [["ad1", "clicks"]]);
  assert.deepEqual(rec.upserts, [["ad1", "clicks", false]]);
});

test("clique: anúncio inativo → 404 droppedInvalid", async () => {
  const { deps, rec } = makeDeps({ selectAd: async () => ({ active: false, expiresAt: null }) });
  const out = await handleClick(deps, req("ad1"));
  assert.equal(out.status, 404);
  assert.deepEqual(out.body, { ok: false, error: "Ad not found or inactive" });
  assert.deepEqual(rec.endpoint, [["adClick", "droppedInvalid"]]);
  assert.equal(rec.upserts.length, 0);
});

test("clique: dedup (duplo clique) → droppedDuplicate, sem escrita", async () => {
  const { deps, rec } = makeDeps({ dedupHit: () => true });
  await handleClick(deps, req("ad1", { sessionId: "s1" }));
  assert.deepEqual(rec.endpoint, [["adClick", "droppedDuplicate"]]);
  assert.equal(rec.increments.length, 0);
});

test("clique: bloco invisível → 404 droppedInvalid", async () => {
  const { deps, rec } = makeDeps({ findAdBlock: () => ({ visible: false }) });
  const out = await handleClick(deps, req("block:z"));
  assert.equal(out.status, 404);
  assert.deepEqual(rec.endpoint, [["adClick", "droppedInvalid"]]);
});

test("clique: bloco visível → upsert clicks (block:)", async () => {
  const { deps, rec } = makeDeps({ findAdBlock: () => ({ visible: true }) });
  const out = await handleClick(deps, req("block:z"));
  assert.deepEqual(out, { body: { ok: true, message: "Click tracked" } });
  assert.deepEqual(rec.upserts, [["block:z", "clicks", false]]);
  assert.equal(rec.increments.length, 0);           // bloco não tem linha em ads
});
