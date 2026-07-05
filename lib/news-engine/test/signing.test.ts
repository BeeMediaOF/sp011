import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeIngestSignature, signIngestRequest, verifyIngestSignature } from "../src/signing.ts";

const SECRET = "segredo-de-teste-32-bytes-ok!!";
const BODY = JSON.stringify({ v: 1, centralId: "abc", article: { title: "T" } });

describe("signIngestRequest / verifyIngestSignature", () => {
  it("roundtrip válido", () => {
    const { timestamp, signature } = signIngestRequest(SECRET, BODY);
    assert.equal(verifyIngestSignature(SECRET, timestamp, BODY, signature).ok, true);
  });

  it("aceita rawBody como Buffer (paridade com req.rawBody)", () => {
    const { timestamp, signature } = signIngestRequest(SECRET, Buffer.from(BODY, "utf8"));
    assert.equal(verifyIngestSignature(SECRET, timestamp, Buffer.from(BODY, "utf8"), signature).ok, true);
  });

  it("corpo adulterado → bad_signature", () => {
    const { timestamp, signature } = signIngestRequest(SECRET, BODY);
    assert.deepEqual(
      verifyIngestSignature(SECRET, timestamp, BODY.replace("abc", "xyz"), signature),
      { ok: false, reason: "bad_signature" },
    );
  });

  it("segredo errado → bad_signature", () => {
    const { timestamp, signature } = signIngestRequest(SECRET, BODY);
    assert.deepEqual(
      verifyIngestSignature("outro-segredo", timestamp, BODY, signature),
      { ok: false, reason: "bad_signature" },
    );
  });

  it("timestamp fora da janela de 300s → timestamp_skew", () => {
    const old = Date.now() - 301_000;
    const { timestamp, signature } = signIngestRequest(SECRET, BODY, old);
    assert.deepEqual(
      verifyIngestSignature(SECRET, timestamp, BODY, signature),
      { ok: false, reason: "timestamp_skew" },
    );
  });

  it("timestamp dentro da janela customizada passa", () => {
    const old = Date.now() - 301_000;
    const { timestamp, signature } = signIngestRequest(SECRET, BODY, old);
    assert.equal(verifyIngestSignature(SECRET, timestamp, BODY, signature, { maxSkewSec: 600 }).ok, true);
  });

  it("headers ausentes → missing", () => {
    assert.deepEqual(verifyIngestSignature(SECRET, undefined, BODY, "aa"), { ok: false, reason: "missing" });
    assert.deepEqual(verifyIngestSignature(SECRET, "123", BODY, undefined), { ok: false, reason: "missing" });
  });

  it("assinatura malformada (hex inválido/curto) → bad_signature", () => {
    const { timestamp } = signIngestRequest(SECRET, BODY);
    assert.deepEqual(verifyIngestSignature(SECRET, timestamp, BODY, "zz"), { ok: false, reason: "bad_signature" });
  });

  it("assinatura é determinística para o mesmo input", () => {
    assert.equal(
      computeIngestSignature(SECRET, "1751700000", BODY),
      computeIngestSignature(SECRET, "1751700000", BODY),
    );
  });
});
