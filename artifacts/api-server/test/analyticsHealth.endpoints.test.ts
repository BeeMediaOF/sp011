import { test } from "node:test";
import assert from "node:assert/strict";
import { bumpHealth, bumpEndpoint, bumpInternalReason, healthSnapshot } from "../src/lib/analyticsHealth.ts";

// PRD 03 RF1/RF4 — contadores por endpoint + razões da marcação interna.
// Contadores são estado de módulo: os testes medem DELTAS (ordem não importa).

test("bumpEndpoint incrementa só o endpoint certo (sem vazar para os outros)", () => {
  const before = healthSnapshot({ buffered: 0 });
  bumpEndpoint("behavior", "droppedBot");
  const after = healthSnapshot({ buffered: 0 });
  assert.equal(after.byEndpoint.behavior.droppedBot - before.byEndpoint.behavior.droppedBot, 1);
  assert.equal(after.byEndpoint.event.droppedBot - before.byEndpoint.event.droppedBot, 0);
  assert.equal(after.byEndpoint.adImpression.droppedBot - before.byEndpoint.adImpression.droppedBot, 0);
  assert.equal(after.byEndpoint.adClick.droppedBot - before.byEndpoint.adClick.droppedBot, 0);
});

test("bumpHealth espelha em byEndpoint.event (call-sites do /event não mudam)", () => {
  const before = healthSnapshot({ buffered: 0 });
  bumpHealth("droppedBot");
  const after = healthSnapshot({ buffered: 0 });
  assert.equal(after.droppedBot - before.droppedBot, 1);                                   // agregado legado
  assert.equal(after.byEndpoint.event.droppedBot - before.byEndpoint.event.droppedBot, 1); // espelho
});

test("flushedOk/flushFailed são de buffer, não têm coluna por endpoint", () => {
  const snap = healthSnapshot({ buffered: 0 });
  assert.ok(!("flushedOk" in snap.byEndpoint.event));
  assert.ok(!("flushFailed" in snap.byEndpoint.event));
});

test("bumpInternalReason + shape do snapshot (byEndpoint 4×6, internalByReason 3, legados intactos)", () => {
  const before = healthSnapshot({ buffered: 0 });
  bumpInternalReason("privateIp");
  const snap = healthSnapshot({ buffered: 7 });
  assert.equal(snap.internalByReason.privateIp - before.internalByReason.privateIp, 1);

  assert.deepEqual(Object.keys(snap.byEndpoint).sort(), ["adClick", "adImpression", "behavior", "event"]);
  assert.equal(Object.keys(snap.byEndpoint.event).length, 6);
  assert.deepEqual(Object.keys(snap.internalByReason).sort(), ["configuredIp", "flag", "privateIp"]);

  for (const k of ["received", "droppedBot", "droppedRate", "droppedInvalid", "droppedDuplicate",
    "flaggedInternal", "flushedOk", "flushFailed", "buffered", "bootAt", "uptimeSeconds"]) {
    assert.ok(k in snap, `falta campo legado ${k}`);
  }
  assert.equal(snap.buffered, 7);
});
