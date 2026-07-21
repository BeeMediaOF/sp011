import { test } from "node:test";
import assert from "node:assert/strict";
import { generateToken, verifyToken, isTokenRevoked } from "../src/middlewares/token.ts";

/**
 * PRD-03 — revogação de token (F14) e issuedAt. Testa as funções puras
 * (sem DB): a decisão de revogação e o roundtrip do token com issuedAt.
 */

test("verifyToken: roundtrip devolve userId/role/issuedAt", () => {
  const before = Date.now();
  const tok = generateToken(42, "admin");
  const p = verifyToken(tok);
  assert.ok(p, "token válido deveria verificar");
  assert.equal(p.userId, 42);
  assert.equal(p.role, "admin");
  assert.ok(p.issuedAt >= before && p.issuedAt <= Date.now() + 1000, `issuedAt fora da janela: ${p.issuedAt}`);
});

test("verifyToken: assinatura adulterada -> null", () => {
  const tok = generateToken(1, "editor");
  const decoded = Buffer.from(tok, "base64url").toString("utf-8");
  const last = decoded.slice(-1);
  const tampered = Buffer.from(decoded.slice(0, -1) + (last === "a" ? "b" : "a")).toString("base64url");
  assert.equal(verifyToken(tampered), null);
});

test("isTokenRevoked: token anterior ao corte é revogado; posterior é aceito", () => {
  const t0 = 1_000_000;
  assert.equal(isTokenRevoked(t0, { passwordChangedAt: new Date(t0 + 1) }), true, "trocou senha depois -> revogado");
  assert.equal(isTokenRevoked(t0, { tokensValidFrom: new Date(t0 - 1) }), false, "logout antes -> ainda válido");
  assert.equal(isTokenRevoked(t0, {}), false, "sem corte -> válido");
  assert.equal(isTokenRevoked(t0, { passwordChangedAt: null, tokensValidFrom: null }), false, "cortes null -> válido");
  // vence o corte MAIS RECENTE entre senha e logout
  assert.equal(
    isTokenRevoked(t0, { passwordChangedAt: new Date(t0 - 100), tokensValidFrom: new Date(t0 + 100) }),
    true,
    "logout mais recente -> revogado",
  );
});
