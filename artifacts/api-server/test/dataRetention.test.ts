import { test } from "node:test";
import assert from "node:assert/strict";
import { planRetention, DEFAULT_RETENTION } from "../src/lib/dataRetention.ts";

/** PRD-12 — o plano de retenção é PURO e conservador. */
const DAY = 86_400_000;

test("planRetention: cutoffs = now - Ndias (180/7/7)", () => {
  const now = new Date("2026-07-21T12:00:00Z");
  const actions = planRetention(now);
  const cm = actions.find((a) => a.table === "contact_messages")!;
  assert.equal(cm.mode, "anonymize");
  assert.deepEqual(cm.columns, ["ip_address", "user_agent"]);
  assert.equal(cm.cutoff.getTime(), now.getTime() - 180 * DAY);
  assert.equal(actions.find((a) => a.table === "login_attempts")!.cutoff.getTime(), now.getTime() - 7 * DAY);
  assert.equal(actions.find((a) => a.table === "endpoint_rate_limits")!.cutoff.getTime(), now.getTime() - 7 * DAY);
});

test("planRetention: NUNCA inclui audit_logs/security_logs", () => {
  const tables = planRetention(new Date()).map((a) => a.table);
  assert.ok(!tables.includes("audit_logs"));
  assert.ok(!tables.includes("security_logs"));
});

test("planRetention: por default, contact_messages é SÓ anonymize (delete desligado)", () => {
  const cm = planRetention(new Date(), DEFAULT_RETENTION).filter((a) => a.table === "contact_messages");
  assert.equal(cm.length, 1);
  assert.equal(cm[0]!.mode, "anonymize");
});

test("planRetention: com contactMessagesDeleteDays, adiciona a ação de delete", () => {
  const actions = planRetention(new Date(), { ...DEFAULT_RETENTION, contactMessagesDeleteDays: 730 });
  assert.ok(actions.some((a) => a.table === "contact_messages" && a.mode === "delete"));
});
