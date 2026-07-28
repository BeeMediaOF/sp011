import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWindowAggregates, computeEngagedSessions, brtDayStartMs, DAY, type EventLike,
} from "../src/lib/analyticsShared.ts";

// Sessão engajada (anti-scanner de link). Janela fixa de 7 dias BRT: 01..07/07/2026.
const FROM = brtDayStartMs("2026-07-01");
const WIN = { fromMs: FROM, toMs: FROM + 7 * DAY };
const T = FROM + 2 * DAY + 5 * 3_600_000; // 03/07 dentro da janela

function pv(over: Partial<EventLike>): EventLike {
  return { type: "pageview", sessionId: "s1", ts: T, device: "desktop", path: "/", ...over };
}

test("computeEngagedSessions: 1 pageview sozinho NÃO engaja; 2 pageviews ou 2º evento engaja", () => {
  const eng = computeEngagedSessions([
    pv({ sessionId: "bot", path: "/" }),                                                    // 1 pv só -> fora
    pv({ sessionId: "duplo", path: "/a" }),
    pv({ sessionId: "duplo", path: "/b" }),                                                 // 2 pv -> engaja
    pv({ sessionId: "leitor", path: "/noticia" }),
    { type: "scroll", sessionId: "leitor", path: "/noticia", scrollDepth: 50, ts: T + 1000 }, // pv + scroll -> engaja
    { type: "read", sessionId: "reader2", path: "/x", duration: 30, ts: T },                // só evento não-pv -> engaja
  ], WIN);
  assert.ok(!eng.has("bot"));
  assert.ok(eng.has("duplo"));
  assert.ok(eng.has("leitor"));
  assert.ok(eng.has("reader2"));
  assert.equal(eng.size, 3);
});

test("computeEngagedSessions: eventos FORA da janela não contam para engajar", () => {
  const eng = computeEngagedSessions([
    pv({ sessionId: "s1", path: "/a" }),
    pv({ sessionId: "s1", path: "/b", ts: FROM - 1 }), // 2º pv fora da janela — não conta
  ], WIN);
  assert.ok(!eng.has("s1")); // só 1 pageview DENTRO da janela
  assert.equal(eng.size, 0);
});

test("engagedOnly: scanner do Facebook (1 pageview social e some) sai das métricas públicas", () => {
  const rows: EventLike[] = [
    // "bot": 1 pageview social e nada mais (o padrão do data center da Meta)
    pv({ sessionId: "bot", referrer: "social", refHost: "facebook.com", device: "desktop" }),
    // leitor real: pageview direto + scroll (2º evento)
    pv({ sessionId: "real", referrer: "direto", device: "mobile" }),
    { type: "scroll", sessionId: "real", path: "/", scrollDepth: 50, ts: T + 1000 },
  ];

  const engaged = buildWindowAggregates(rows, WIN, { engagedOnly: true });
  assert.equal(engaged.windowPv, 1);                              // só o leitor real
  assert.equal(engaged.channelMap["social"], 0);                 // o Facebook-bot saiu de Fontes
  assert.equal(engaged.channelMap["direto"], 1);
  assert.equal(engaged.deviceMap["desktop"], 0);                 // desktop era só o bot
  assert.equal(engaged.deviceMap["mobile"], 1);
  assert.equal(Object.keys(engaged.sessionPageviews).length, 1); // 1 sessão engajada

  // Sem engagedOnly (default): o bot continua contando — opt-in, byte-idêntico.
  const raw = buildWindowAggregates(rows, WIN);
  assert.equal(raw.windowPv, 2);
  assert.equal(raw.channelMap["social"], 1);
  assert.equal(raw.deviceMap["desktop"], 1);
});

test("engagedOnly não altera uma janela 100% engajada (nada de falso corte)", () => {
  const rows: EventLike[] = [
    pv({ sessionId: "a", path: "/1" }),
    pv({ sessionId: "a", path: "/2" }), // a: 2 pv
    pv({ sessionId: "b", path: "/1" }),
    { type: "read", sessionId: "b", path: "/1", duration: 40, ts: T + 1000 }, // b: pv + read
  ];
  const eng = buildWindowAggregates(rows, WIN, { engagedOnly: true });
  const raw = buildWindowAggregates(rows, WIN);
  assert.equal(eng.windowPv, raw.windowPv);
  assert.equal(eng.windowPv, 3);
  assert.equal(Object.keys(eng.sessionPageviews).length, 2);
});
