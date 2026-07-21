import { test } from "node:test";
import assert from "node:assert/strict";
import { errorResponseBody } from "../src/lib/errorResponse.ts";

/** PRD-13 — o corpo de erro nunca vaza err.message/stack em produção (CWE-209). */

test("produção: 500 sem message/stack e sem detalhe interno", () => {
  const { status, body } = errorResponseBody(new Error("segredo interno: postgres://user:pass@host"), true, "abc");
  assert.equal(status, 500);
  assert.equal(body.error, "internal_error");
  assert.equal(body.requestId, "abc");
  assert.equal(body.message, undefined);
  assert.equal(body.stack, undefined);
  assert.ok(!JSON.stringify(body).includes("segredo"));
});

test("dev: expõe message (DX)", () => {
  assert.equal(errorResponseBody(new Error("detalhe dev"), false).body.message, "detalhe dev");
});

test("mapeia entity.too.large=413, entity.parse.failed=400, CORS=403", () => {
  assert.equal(errorResponseBody({ type: "entity.too.large" }, true).status, 413);
  assert.equal(errorResponseBody({ type: "entity.parse.failed" }, true).status, 400);
  assert.equal(errorResponseBody({ message: "Origem X nao permitida pelo CORS" }, true).status, 403);
});

test("erro com status/statusCode explícito é respeitado", () => {
  assert.equal(errorResponseBody({ status: 403 }, true).status, 403);
  assert.equal(errorResponseBody({ statusCode: 400 }, true).status, 400);
});

test("handler-style: res mockado, produção, sem err.message no corpo", () => {
  const { status, body } = errorResponseBody(new Error("boom secreto"), true, "req-1");
  const res = {
    _c: 0, _b: null as unknown,
    status(c: number) { this._c = c; return this; },
    json(b: unknown) { this._b = b; return this; },
  };
  res.status(status).json(body);
  assert.equal(res._c, 500);
  assert.ok(!JSON.stringify(res._b).includes("boom secreto"));
});
