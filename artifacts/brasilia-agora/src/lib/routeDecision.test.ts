/**
 * Testes da decisão de rota (P0 de indexação). O que se prova aqui:
 *  - indisponibilidade NUNCA vira 404;
 *  - UUID redireciona para o slug, sem laço por encoding;
 *  - editoria com conteúdo não é desindexada por estar fora do menu.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideArticle, decideCategory, decideUnavailable,
  canonicalArticleSlug, canonicalArticlePath,
} from "./routeDecision";

const UUID = "ce9ce8e2-68be-4ecf-8c7f-88d1e476607f";

/* ── Artigo ─────────────────────────────────────────────────────────────── */

test("A-1: slug pedido e igual ao canonico -> 200, sem redirect", () => {
  const d = decideArticle({ requested: "futebol-x", state: "found", article: { slug: "futebol-x", id: UUID } });
  assert.deepEqual(d, { status: 200, action: "render" });
});

test("A-2: UUID de artigo com slug -> 301 para o slug", () => {
  const d = decideArticle({ requested: UUID, state: "found", article: { slug: "futebol-x", id: UUID } });
  assert.equal(d.status, 301);
  assert.equal(d.location, "/artigo/futebol-x");
});

test("A-3/A-4: artigo sem slug (ou com slug vazio) fica no UUID", () => {
  assert.deepEqual(
    decideArticle({ requested: UUID, state: "found", article: { slug: null, id: UUID } }),
    { status: 200, action: "render" },
  );
  assert.deepEqual(
    decideArticle({ requested: UUID, state: "found", article: { slug: "", id: UUID } }),
    { status: 200, action: "render" },
  );
});

test("A-5/A-6: artigo inexistente e o placeholder respondem 404 com noindex", () => {
  for (const requested of ["nao-existe", "__placeholder__"]) {
    const d = decideArticle({ requested, state: "notFound" });
    assert.equal(d.status, 404, requested);
    assert.equal(d.action, "notFound");
    assert.equal(d.noindex, true);
  }
});

test("A-7: api fora COM html em cache -> 200 com o stale", () => {
  const d = decideArticle({ requested: "qualquer", state: "unavailable", hasStale: true });
  assert.deepEqual(d, { status: 200, action: "stale" });
});

test("A-8: api fora SEM stale -> 503, nunca 404", () => {
  const d = decideArticle({ requested: "qualquer", state: "unavailable", hasStale: false });
  assert.deepEqual(d, { status: 503, action: "unavailable" });
  assert.notEqual(d.status, 404);
});

test("A-9: slug com acento nao gera 301 por encoding (sem laco)", () => {
  const slug = "uts-rio-jo\u00e3o-fonseca";
  const d = decideArticle({
    requested: encodeURIComponent(slug), state: "found", article: { slug, id: UUID },
  });
  assert.deepEqual(d, { status: 200, action: "render" });
  // e o mesmo slug cru, como o wouter o entrega, tambem nao redireciona
  assert.deepEqual(
    decideArticle({ requested: slug, state: "found", article: { slug, id: UUID } }),
    { status: 200, action: "render" },
  );
});

test("A-10: slug com espaco -> 200 quando pedido por ele, %20 no Location quando pedido pelo id", () => {
  const slug = "thiagog silvaehulkfluminense";
  assert.deepEqual(
    decideArticle({ requested: encodeURIComponent(slug), state: "found", article: { slug, id: UUID } }),
    { status: 200, action: "render" },
  );
  const d = decideArticle({ requested: UUID, state: "found", article: { slug, id: UUID } });
  assert.equal(d.status, 301);
  assert.equal(d.location, "/artigo/thiagog%20silvaehulkfluminense");
});

test("A-11: o 301 preserva a query string", () => {
  const d = decideArticle({
    requested: UUID, query: "?utm_source=x&b=2", state: "found", article: { slug: "s", id: UUID },
  });
  assert.equal(d.location, "/artigo/s?utm_source=x&b=2");
});

test("A-12: pedir o proprio slug nunca redireciona (prova de ausencia de laco)", () => {
  const d = decideArticle({ requested: "futebol-x", state: "found", article: { slug: "futebol-x" } });
  assert.equal(d.action, "render");
  assert.equal(d.location, undefined);
});

test("percent-encoding invalido nao derruba a decisao", () => {
  const d = decideArticle({ requested: "%E0%A4%A", state: "found", article: { slug: "s", id: UUID } });
  assert.equal(d.status, 301);
});

test("canonicalArticleSlug/Path: slug vence o id, e o path sai encodado", () => {
  assert.equal(canonicalArticleSlug({ slug: "a-b", id: UUID }), "a-b");
  assert.equal(canonicalArticleSlug({ slug: "  ", id: UUID }), UUID);
  assert.equal(canonicalArticleSlug({}), "");
  assert.equal(canonicalArticlePath({ slug: "a b" }), "/artigo/a%20b");
  assert.equal(canonicalArticlePath({}), "");
});

/* ── Editoria ───────────────────────────────────────────────────────────── */

test("C-1: declarada e com conteudo -> 200 indexavel", () => {
  assert.deepEqual(
    decideCategory({ declared: true, total: 307, state: "found" }),
    { status: 200, action: "render" },
  );
});

test("C-2/C-5: declarada e VAZIA -> 200 + noindex (visivel ou nao no menu)", () => {
  for (const declared of [true]) {
    const d = decideCategory({ declared, total: 0, state: "found" });
    assert.equal(d.status, 200);
    assert.equal(d.noindex, true);
  }
});

test("C-3: NAO declarada mas com conteudo -> 200 SEM noindex (sp011 /seguranca)", () => {
  const d = decideCategory({ declared: false, total: 163, state: "found" });
  assert.deepEqual(d, { status: 200, action: "render" });
  assert.notEqual(d.noindex, true);
});

test("C-4: declarada, oculta no menu e com conteudo -> 200 indexavel (Oley /copa-do-mundo)", () => {
  const d = decideCategory({ declared: true, total: 86, state: "found" });
  assert.deepEqual(d, { status: 200, action: "render" });
});

test("C-6: nao declarada e vazia -> 404 (Oley /politica, /geral)", () => {
  const d = decideCategory({ declared: false, total: 0, state: "found" });
  assert.equal(d.status, 404);
  assert.equal(d.noindex, true);
});

test("C-7: slug corrompido com conteudo e servido ate a higiene de dados (tebol)", () => {
  assert.deepEqual(
    decideCategory({ declared: false, total: 39, state: "found" }),
    { status: 200, action: "render" },
  );
  // depois do UPDATE de higiene, o mesmo slug fica com zero artigos e vira 404
  // sem nenhuma linha de codigo nova:
  assert.equal(decideCategory({ declared: false, total: 0, state: "found" }).status, 404);
});

test("C-8/C-9: api fora -> stale ou 503, jamais 404", () => {
  assert.deepEqual(
    decideCategory({ declared: true, total: 0, state: "unavailable", hasStale: true }),
    { status: 200, action: "stale" },
  );
  assert.deepEqual(
    decideCategory({ declared: false, total: 0, state: "unavailable" }),
    { status: 503, action: "unavailable" },
  );
});

test("decideUnavailable e a UNICA regra de indisponibilidade dos dois caminhos", () => {
  assert.deepEqual(decideUnavailable(true), { status: 200, action: "stale" });
  assert.deepEqual(decideUnavailable(false), { status: 503, action: "unavailable" });
});
