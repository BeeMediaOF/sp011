/**
 * Testes do fallback de arquivos (P0 de indexação). O risco desta função é
 * simétrico: 404 num asset que existe quebra o site; 200 num arquivo que não
 * existe é o soft-404 que o buscador rastreia.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRelative, hasFileExtension, isStaticCandidate } from "./staticPath";

test("T-1/T-2/T-3: arquivo comum vira caminho relativo simples", () => {
  assert.equal(safeRelative("/assets/main-abc123.js"), "assets/main-abc123.js");
  assert.equal(safeRelative("/assets/inexistente.js"), "assets/inexistente.js");
  assert.equal(safeRelative("/nada.xml"), "nada.xml");
  assert.equal(safeRelative("/wp-login.php"), "wp-login.php");
  assert.equal(safeRelative("/favicon.jpg"), "favicon.jpg");
});

test("T-5: travessia de diretorio e recusada ANTES de tocar o disco", () => {
  for (const p of [
    "/../../etc/passwd",
    "/%2e%2e/x.js",
    "/%2e%2e%2f%2e%2e%2fetc/passwd",
    "/assets/../../secret.env",
    "/./x.js",
    "/assets/..%2f..%2fx",
  ]) {
    assert.equal(safeRelative(p), null, p);
  }
});

test("byte nulo, barra invertida e encoding quebrado nao viram caminho", () => {
  assert.equal(safeRelative("/x%00.js"), null);
  // barra invertida montada por codigo: o repo proibe unicode/escape literal
  const bs = String.fromCharCode(92);
  assert.equal(safeRelative(`/..${bs}windows${bs}system32`), null);
  assert.equal(safeRelative("/%E0%A4%A"), null);
  assert.equal(safeRelative("nao-absoluto.js"), null);
  assert.equal(safeRelative("/"), null);
});

test("barra dupla e barra final nao criam segmento vazio", () => {
  assert.equal(safeRelative("//assets//x.js"), "assets/x.js");
});

test("T-6/T-7: rota de pagina e /api nao sao competencia deste plugin", () => {
  assert.equal(isStaticCandidate("/futebol"), false);
  assert.equal(isStaticCandidate("/artigo/algum-slug"), false);
  assert.equal(isStaticCandidate("/admin/artigos"), false);
  assert.equal(isStaticCandidate("/api/site"), false);
  assert.equal(isStaticCandidate("/api/sitemap.xml"), false);
});

test("arquivo com extensao e candidato", () => {
  for (const p of ["/assets/x.js", "/nada.xml", "/wp-login.php", "/favicon.jpg", "/sw.js"]) {
    assert.equal(isStaticCandidate(p), true, p);
  }
  assert.equal(hasFileExtension("/futebol"), false);
  assert.equal(hasFileExtension("/arquivo.tar.gz"), true);
});
