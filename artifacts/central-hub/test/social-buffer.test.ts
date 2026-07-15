import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractRetryAfter,
  isRateLimitResponse,
  effectiveRetryAfterSeconds,
  formatWaitTime,
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_RETRY_AFTER_SECONDS,
} from "../src/lib/social/bufferParse.ts";

describe("extractRetryAfter", () => {
  it("header tem prioridade", () => {
    assert.equal(extractRetryAfter("120", { retry_after: 30 }), 120);
  });

  it("varre os caminhos do corpo", () => {
    assert.equal(extractRetryAfter(null, { retry_after: 30 }), 30);
    assert.equal(extractRetryAfter(null, { retryAfter: "45" }), 45);
    assert.equal(extractRetryAfter(null, { errors: [{ retryAfter: 60 }] }), 60);
    assert.equal(extractRetryAfter(null, { errors: [{ extensions: { retryAfter: 90 } }] }), 90);
    assert.equal(extractRetryAfter(null, { extensions: { retryAfter: 15 } }), 15);
  });

  it("ausente/inválido → 0 (corpo pode nem ser objeto em 429)", () => {
    assert.equal(extractRetryAfter(null, {}), 0);
    assert.equal(extractRetryAfter(undefined, null), 0);
    assert.equal(extractRetryAfter("abc", { retryAfter: "xyz" }), 0);
  });
});

describe("isRateLimitResponse", () => {
  it("429, retryAfter ou mensagem de limite", () => {
    assert.equal(isRateLimitResponse(429, 0, {}), true);
    assert.equal(isRateLimitResponse(200, 60, {}), true);
    assert.equal(isRateLimitResponse(200, 0, { errors: [{ message: "Rate limit exceeded" }] }), true);
    assert.equal(isRateLimitResponse(200, 0, { errors: [{ message: "Too many requests" }] }), true);
    assert.equal(isRateLimitResponse(200, 0, { errors: [{ message: "canal inválido" }] }), false);
    assert.equal(isRateLimitResponse(200, 0, null), false);
  });
});

describe("effectiveRetryAfterSeconds", () => {
  it("default 900s quando ausente; teto de 6h", () => {
    assert.equal(effectiveRetryAfterSeconds(0), DEFAULT_RETRY_AFTER_SECONDS);
    assert.equal(effectiveRetryAfterSeconds(300), 300);
    assert.equal(effectiveRetryAfterSeconds(999_999), MAX_RETRY_AFTER_SECONDS);
  });
});

describe("formatWaitTime", () => {
  it("minutos e horas legíveis", () => {
    assert.equal(formatWaitTime(900), "15min");
    assert.equal(formatWaitTime(3600), "1h");
    assert.equal(formatWaitTime(5400), "1h30min");
  });
});
