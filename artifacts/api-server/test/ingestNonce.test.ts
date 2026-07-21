import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryNonceStore } from "../src/lib/ingestNonceCore.ts";

/** PRD-14 — anti-replay real: a mesma assinatura só é aceita UMA vez. */

test("consume: 1ª vez = true (fresco); 2ª = false (replay)", async () => {
  const store = createMemoryNonceStore();
  assert.equal(await store.consume("sig-abc"), true);
  assert.equal(await store.consume("sig-abc"), false);
  assert.equal(await store.consume("sig-abc"), false);
});

test("consume: assinaturas distintas são independentes", async () => {
  const store = createMemoryNonceStore();
  assert.equal(await store.consume("sig-1"), true);
  assert.equal(await store.consume("sig-2"), true);
  assert.equal(await store.consume("sig-1"), false);
});
