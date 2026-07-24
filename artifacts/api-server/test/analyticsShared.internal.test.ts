import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInternal, parseInternalIps, normalizeIp } from "../src/lib/analyticsShared.ts";

// PRD 03 RF4 — tripla canônica de detecção de tráfego interno, com razão.

const EMPTY: ReadonlySet<string> = new Set();

test("detectInternal: cada gatilho isolado", () => {
  assert.deepEqual(detectInternal(true, "8.8.8.8", EMPTY), { internal: true, reason: "flag" });
  assert.deepEqual(detectInternal(false, "1.2.3.4", new Set(["1.2.3.4"])), { internal: true, reason: "configuredIp" });
  assert.deepEqual(detectInternal(false, "10.0.0.5", EMPTY), { internal: true, reason: "privateIp" });
  assert.deepEqual(detectInternal(false, "8.8.8.8", EMPTY), { internal: false, reason: null });
});

test("detectInternal: precedência flag > configuredIp > privateIp", () => {
  const cfg = new Set(["10.0.0.5"]); // IP privado E cadastrado
  assert.equal(detectInternal(true, "10.0.0.5", cfg).reason, "flag");        // flag vence
  assert.equal(detectInternal(false, "10.0.0.5", cfg).reason, "configuredIp"); // configuredIp vence privateIp
});

test("detectInternal: IP privado mapeado ::ffff: é reconhecido (privateIp)", () => {
  assert.equal(detectInternal(false, "::ffff:10.0.0.1", EMPTY).reason, "privateIp");
});

test("simetria de normalização (§2.4): parseInternalIps casa com normalizeIp para ::ffff:", () => {
  const configured = new Set(parseInternalIps("::ffff:1.2.3.4"));
  const ip = normalizeIp("::ffff:1.2.3.4");
  assert.equal(detectInternal(false, ip, configured).reason, "configuredIp");
});
