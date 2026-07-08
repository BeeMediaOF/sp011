import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod, brtDayKey, brtDayStartMs, DAY } from "../src/lib/analyticsShared.ts";

// 01/08/2026 01:00 UTC = 31/07/2026 22:00 em Brasília — virada de mês BRT.
const NOW = Date.parse("2026-08-01T01:00:00Z");

test("virada de mês BRT: 01/08 01:00 UTC ainda é 31/07 em Brasília", () => {
  assert.equal(brtDayKey(NOW), "2026-07-31");
});

test("today/yesterday: 1 dia BRT exato", () => {
  const today = resolvePeriod({ period: "today" }, NOW);
  assert.equal(today.key, "today");
  assert.equal(today.fromDay, "2026-07-31");
  assert.equal(today.toDay, "2026-07-31");
  assert.equal(today.days, 1);
  assert.equal(today.fromMs, brtDayStartMs("2026-07-31"));
  assert.equal(today.toMs, today.fromMs + DAY);

  const y = resolvePeriod({ period: "yesterday" }, NOW);
  assert.equal(y.fromDay, "2026-07-30");
  assert.equal(y.days, 1);
});

test("7d: 7 dias incluindo hoje; janela anterior adjacente e do mesmo tamanho", () => {
  const w = resolvePeriod({ period: "7d" }, NOW);
  assert.equal(w.fromDay, "2026-07-25");
  assert.equal(w.toDay, "2026-07-31");
  assert.equal(w.days, 7);
  assert.equal(w.prevToMs, w.fromMs);              // adjacente, sem buraco
  assert.equal(w.fromMs - w.prevFromMs, 7 * DAY);  // mesmo tamanho
});

test("entrada inválida NUNCA erra: cai no padrão de 30 dias", () => {
  for (const q of [{}, { period: "weird" }, { period: 42 as unknown }, { period: "custom" }, { period: "custom", from: "x", to: "y" }, { period: "custom", from: "2026-02-31", to: "2026-03-05" }, { period: "custom", from: "2026-07-10", to: "2026-07-01" }]) {
    const w = resolvePeriod(q as { period?: unknown; from?: unknown; to?: unknown }, NOW);
    assert.equal(w.key, "30d", JSON.stringify(q));
    assert.equal(w.days, 30);
  }
});

test("custom válido: dias inclusivos e label dd/mm/aaaa", () => {
  const w = resolvePeriod({ period: "custom", from: "2026-07-01", to: "2026-07-07" }, NOW);
  assert.equal(w.key, "custom");
  assert.equal(w.days, 7);
  assert.equal(w.label, "01/07/2026 a 07/07/2026");
});

test("custom: futuro clampa em hoje; período gigante clampa em 366 dias", () => {
  const fut = resolvePeriod({ period: "custom", from: "2026-07-01", to: "2026-12-31" }, NOW);
  assert.equal(fut.toDay, "2026-07-31");

  const big = resolvePeriod({ period: "custom", from: "2020-01-01", to: "2026-07-01" }, NOW);
  assert.equal(big.days, 366);
  assert.equal(big.toDay, "2026-07-01");
});
