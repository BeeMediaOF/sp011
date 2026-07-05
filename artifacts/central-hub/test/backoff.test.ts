import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BACKOFF_MINUTES, MAX_DELIVERY_ATTEMPTS, backoffMsForAttempt } from "../src/lib/backoff.ts";

describe("backoffMsForAttempt", () => {
  it("escala 1m → 5m → 15m → 1h → 6h", () => {
    assert.equal(backoffMsForAttempt(1), 60_000);
    assert.equal(backoffMsForAttempt(2), 5 * 60_000);
    assert.equal(backoffMsForAttempt(3), 15 * 60_000);
    assert.equal(backoffMsForAttempt(4), 60 * 60_000);
    assert.equal(backoffMsForAttempt(5), 360 * 60_000);
  });

  it("fora do intervalo é clampado", () => {
    assert.equal(backoffMsForAttempt(0), 60_000);
    assert.equal(backoffMsForAttempt(99), 360 * 60_000);
  });

  it("política cobre exatamente MAX_DELIVERY_ATTEMPTS", () => {
    assert.equal(BACKOFF_MINUTES.length, MAX_DELIVERY_ATTEMPTS);
  });
});
