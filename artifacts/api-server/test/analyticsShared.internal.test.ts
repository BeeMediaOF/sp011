import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInternal, parseInternalIps, normalizeIp, isHostingNetwork } from "../src/lib/analyticsShared.ts";

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

// Anti-scanner por ASN/hosting: Meta (AS32934) e a flag hosting do ip-api viram interno;
// ISP residencial/móvel NUNCA. É a fonte da razão "hosting" (setada no lookupGeoAsync).
test("isHostingNetwork: Meta/X/hosting sim; ISP residencial/móvel não", () => {
  assert.equal(isHostingNetwork("AS32934 Facebook, Inc."), true);       // Meta (o scanner do caso)
  assert.equal(isHostingNetwork("AS13414 Twitter Inc."), true);         // X/Twitter
  assert.equal(isHostingNetwork(undefined, true), true);                // flag hosting do ip-api
  assert.equal(isHostingNetwork("AS8167 V tal S.A."), false);           // fibra residencial
  assert.equal(isHostingNetwork("AS28573 Claro NXT Telecomunicacoes"), false); // móvel
  assert.equal(isHostingNetwork("AS329340 Outra Coisa"), false);        // não confunde AS329340 com AS32934
  assert.equal(isHostingNetwork(undefined, undefined), false);          // sem sinal
  assert.equal(isHostingNetwork(""), false);
});
