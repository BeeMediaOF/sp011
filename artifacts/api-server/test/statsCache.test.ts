import { test } from "node:test";
import assert from "node:assert/strict";
import { StatsResponseCache, STATS_CACHE_TTL_MS } from "../src/lib/statsCache.ts";

const TTL = 1000; // relógio fake em ms — sem setTimeout real

test("StatsResponseCache: get antes de qualquer set → null", () => {
  const c = new StatsResponseCache<number>(TTL);
  assert.equal(c.get("a", 0), null);
});

test("StatsResponseCache: HIT dentro do TTL, MISS no limite (>=)", () => {
  const c = new StatsResponseCache<string>(TTL);
  c.set("a", "v", 1000);
  assert.equal(c.get("a", 1000), "v");              // mesmo instante
  assert.equal(c.get("a", 1000 + TTL - 1), "v");    // 1ms antes de expirar
  assert.equal(c.get("a", 1000 + TTL), null);       // exatamente no limite → expirado
  assert.equal(c.get("a", 1000 + TTL + 5000), null);
});

test("StatsResponseCache: chave diferente nunca vaza (MISS)", () => {
  const c = new StatsResponseCache<string>(TTL);
  c.set("janelaA", "valorA", 0);
  assert.equal(c.get("janelaB", 0), null); // outra janela → nunca serve valorA
  assert.equal(c.get("janelaA", 0), "valorA");
});

test("StatsResponseCache: 1 slot — segundo set com chave nova sobrescreve o primeiro", () => {
  const c = new StatsResponseCache<string>(TTL);
  c.set("k1", "v1", 0);
  c.set("k2", "v2", 0);
  assert.equal(c.get("k1", 0), null); // slot único foi tomado por k2
  assert.equal(c.get("k2", 0), "v2");
});

test("StatsResponseCache: re-set da mesma chave renova o computedAt", () => {
  const c = new StatsResponseCache<string>(TTL);
  c.set("k", "v1", 0);
  assert.equal(c.get("k", TTL - 1), "v1");
  c.set("k", "v2", TTL - 1);             // renova
  assert.equal(c.get("k", TTL - 1), "v2");
  assert.equal(c.get("k", 2 * TTL - 2), "v2"); // ainda vivo relativo ao 2º set
  assert.equal(c.get("k", 2 * TTL - 1), null); // expira a partir do 2º set
});

test("STATS_CACHE_TTL_MS: 20s, abaixo do auto-refresh de 30s do front", () => {
  assert.equal(STATS_CACHE_TTL_MS, 20_000);
  assert.ok(STATS_CACHE_TTL_MS < 30_000);
});
