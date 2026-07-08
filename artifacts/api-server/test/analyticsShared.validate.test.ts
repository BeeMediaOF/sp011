import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanStr, normalizeIp, isPrivateIp, parseInternalIps, pctChange,
  VALID_TYPES, SCROLL_MILESTONES, MAX_READ_SECONDS,
} from "../src/lib/analyticsShared.ts";
import { isRecentDuplicate } from "../src/lib/trafficGuard.ts";

test("cleanStr: corta no teto, rejeita vazio e não-string", () => {
  assert.equal(cleanStr("a".repeat(600), 500)?.length, 500);
  assert.equal(cleanStr("", 10), undefined);
  assert.equal(cleanStr(123, 10), undefined);
  assert.equal(cleanStr(null, 10), undefined);
});

test("whitelists: tipos e marcos de scroll fechados", () => {
  assert.ok(VALID_TYPES.has("pageview") && VALID_TYPES.has("share"));
  assert.ok(!VALID_TYPES.has("hack"));
  assert.ok(SCROLL_MILESTONES.has(25) && SCROLL_MILESTONES.has(100));
  assert.ok(!SCROLL_MILESTONES.has(10));
  assert.equal(MAX_READ_SECONDS, 1800);
});

test("IPs: normalização IPv4-mapped e detecção de rede privada", () => {
  assert.equal(normalizeIp("::ffff:1.2.3.4"), "1.2.3.4");
  assert.ok(isPrivateIp("127.0.0.1"));
  assert.ok(isPrivateIp("::1"));
  assert.ok(isPrivateIp("10.0.0.5"));
  assert.ok(isPrivateIp("192.168.1.10"));
  assert.ok(isPrivateIp("172.20.1.1"));
  assert.ok(isPrivateIp(""));
  assert.ok(!isPrivateIp("8.8.8.8"));
  assert.ok(!isPrivateIp("172.32.0.1")); // fora da faixa 172.16-31
});

test("parseInternalIps: vírgula/espaço/linha e ::ffff: normalizado", () => {
  assert.deepEqual(
    parseInternalIps("1.2.3.4, 5.6.7.8\n ::ffff:9.9.9.9; "),
    ["1.2.3.4", "5.6.7.8", "9.9.9.9"],
  );
  assert.deepEqual(parseInternalIps(undefined), []);
  assert.deepEqual(parseInternalIps("  "), []);
});

test("isRecentDuplicate: repetição imediata detectada; janela expira", async () => {
  assert.equal(isRecentDuplicate("pv:test-a|/x", 60_000), false);
  assert.equal(isRecentDuplicate("pv:test-a|/x", 60_000), true);  // F5 imediato
  assert.equal(isRecentDuplicate("pv:test-b|/x", 60_000), false); // outra sessão não colide

  assert.equal(isRecentDuplicate("pv:test-c|/x", 5), false);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(isRecentDuplicate("pv:test-c|/x", 5), false); // janela venceu
});

test("pctChange: null sem base de comparação — nunca inventa 0%", () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(90, 100), -10);
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(0, 0), null);
});
