import { test } from "node:test";
import assert from "node:assert/strict";
import { createDedupWindow, INGEST_RATE_LIMITS } from "../src/lib/trafficGuard.ts";

// PRD 03 RF5 — dedup genérico com retenção configurável (consumido pelo PRD 04).
// Relógio injetado (`now`) — determinístico, sem esperar timers.

test("createDedupWindow: 1o hit false; 2o dentro da janela true; apos a janela false", () => {
  let now = 0;
  const d = createDedupWindow({ windowMs: 1000, now: () => now });
  assert.equal(d.hit("k"), false);   // 1a vez
  now = 500;
  assert.equal(d.hit("k"), true);    // dentro da janela: duplicata
  now = 1000;
  assert.equal(d.hit("k"), false);   // janela expirou (exp 1000, now 1000)
});

test("createDedupWindow: modo fixed nao renova; sliding renova a cada hit", () => {
  let now = 0;
  const fixed = createDedupWindow({ windowMs: 1000, now: () => now });
  fixed.hit("k");                    // exp = 1000
  now = 800;
  assert.equal(fixed.hit("k"), true); // duplicata; fixed NAO renova
  now = 1000;
  assert.equal(fixed.hit("k"), false); // expirou no 1000 original

  now = 0;
  const sliding = createDedupWindow({ windowMs: 1000, sliding: true, now: () => now });
  sliding.hit("k");                    // exp = 1000
  now = 900;
  assert.equal(sliding.hit("k"), true); // dentro; renova -> exp = 1900
  now = 1800;
  assert.equal(sliding.hit("k"), true); // ainda dentro (< 1900); renova -> exp = 2800
  now = 2800;
  assert.equal(sliding.hit("k"), false); // parou de bater; exp 2800 nao > 2800 -> expira
});

test("createDedupWindow: teto de chaves expulsa a mais antiga", () => {
  let now = 0;
  const d = createDedupWindow({ windowMs: 1_000_000, maxKeys: 3, now: () => now });
  d.hit("a"); now = 1; d.hit("b"); now = 2; d.hit("c");
  now = 3; d.hit("d");               // excede 3 -> "a" (mais antiga) sai
  assert.equal(d.size(), 3);
  now = 4;
  assert.equal(d.hit("a"), false);   // "a" saiu -> primeira vez de novo
});

test("createDedupWindow: chaves distintas sao independentes; size() consistente", () => {
  let now = 0;
  const d = createDedupWindow({ windowMs: 1000, now: () => now });
  assert.equal(d.hit("adimp:x:s"), false);
  assert.equal(d.hit("adclick:x:s"), false); // chave diferente
  assert.equal(d.size(), 2);
  assert.equal(d.hit("adimp:x:s"), true);
});

test("PRD 03 RF7: INGEST_RATE_LIMITS = {event:120, behavior:30, adImpression:60, adClick:30}", () => {
  assert.deepEqual({ ...INGEST_RATE_LIMITS }, { event: 120, behavior: 30, adImpression: 60, adClick: 30 });
});
