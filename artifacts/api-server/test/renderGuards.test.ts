import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runWithTimeout, acquireRenderSlot, releaseRenderSlot, MAX_CONCURRENT_RENDERS,
} from "../src/lib/social/renderGuards.ts";

/** PRD-11 — guards de recurso do render social (funções puras, sem Chromium). */

test("runWithTimeout: task rápida resolve", async () => {
  assert.equal(await runWithTimeout(async () => 42, 1000), 42);
});

test("runWithTimeout: task lenta rejeita com timeout", async () => {
  await assert.rejects(
    runWithTimeout(() => new Promise((r) => setTimeout(r, 300)), 40),
    /timeout/,
  );
});

test("semáforo: a (MAX+1)-ésima aquisição espera uma liberação", async () => {
  for (let i = 0; i < MAX_CONCURRENT_RENDERS; i++) await acquireRenderSlot();
  let acquired = false;
  const p = acquireRenderSlot().then(() => { acquired = true; });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(acquired, false, "não deveria adquirir com o semáforo cheio");
  releaseRenderSlot(); // passa o slot ao waiter
  await p;
  assert.equal(acquired, true);
  for (let i = 0; i < MAX_CONCURRENT_RENDERS; i++) releaseRenderSlot(); // limpa o estado global
});
