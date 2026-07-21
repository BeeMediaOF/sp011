import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldAlert, alertDedupeKey, resolveDispatch } from "../src/lib/securityAlertCore.ts";

/** PRD-13 — sink de alerta: severidade + allowlist + dedupe + fail-open. */

test("shouldAlert: severidade e allowlist de alto sinal", () => {
  assert.equal(shouldAlert({ eventType: "failed_login", severity: "low" }, "high"), false);
  assert.equal(shouldAlert({ eventType: "account_locked", severity: "high" }, "high"), true);
  // medium < high E não está na allowlist → não alerta
  assert.equal(shouldAlert({ eventType: "failed_login", severity: "medium" }, "high"), false);
  assert.equal(shouldAlert({ eventType: "ingest_signature_invalid", severity: "high" }, "high"), true);
  assert.equal(shouldAlert({ eventType: "qualquer", severity: "critical" }, "high"), true);
});

test("alertDedupeKey combina eventType + ip", () => {
  assert.equal(alertDedupeKey({ eventType: "account_locked", ipAddress: "1.2.3.4" }), "account_locked:1.2.3.4");
  assert.equal(alertDedupeKey({ eventType: "x" }), "x:-");
});

test("resolveDispatch: sem webhook → não dispara (no-op fail-open)", () => {
  const d = resolveDispatch({ eventType: "account_locked", severity: "high" }, {}, undefined, 1000);
  assert.equal(d.dispatch, false);
  assert.equal(d.reason, "no_webhook");
});

test("resolveDispatch: evento fraco → não dispara", () => {
  const d = resolveDispatch(
    { eventType: "failed_login", severity: "low" },
    { SECURITY_ALERT_WEBHOOK_URL: "https://hook" },
    undefined, 1000,
  );
  assert.equal(d.dispatch, false);
  assert.equal(d.reason, "not_high_signal");
});

test("resolveDispatch: dedupe dentro da janela → não dispara", () => {
  const env = { SECURITY_ALERT_WEBHOOK_URL: "https://hook" };
  const d = resolveDispatch({ eventType: "account_locked", severity: "high" }, env, 1000, 1500, 300_000);
  assert.equal(d.dispatch, false);
  assert.equal(d.reason, "debounced");
});

test("resolveDispatch: alto sinal + webhook + fora da janela → dispara", () => {
  const d = resolveDispatch(
    { eventType: "account_locked", severity: "high" },
    { SECURITY_ALERT_WEBHOOK_URL: "https://hook" },
    1000, 1000 + 400_000, 300_000,
  );
  assert.equal(d.dispatch, true);
  assert.equal(d.url, "https://hook");
});
