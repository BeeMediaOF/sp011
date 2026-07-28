import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articlesUrl, isHomeRoute, listLimitForRoute,
  ARTICLES_LIST_LIMIT, ARTICLES_TICKER_LIMIT,
} from "./articlesQuery.ts";

// PRD-PERF-01 — a URL montada aqui precisa sair IDÊNTICA à que o prefetch inline
// do index.html monta à mão; qualquer byte diferente e o fetch do useArticles
// vira um segundo download em vez de acertar o cache HTTP.

test("URL da home é byte-idêntica à do boot prefetch do index.html", () => {
  // Espelho literal de index.html: "/api/articles?limit=" + (isHome ? 200 : 30) + "&offset=0&sort=recent"
  assert.equal(
    articlesUrl({ limit: ARTICLES_LIST_LIMIT, offset: 0, sort: "recent" }),
    "/api/articles?limit=200&offset=0&sort=recent");
  assert.equal(
    articlesUrl({ limit: ARTICLES_TICKER_LIMIT, offset: 0, sort: "recent" }),
    "/api/articles?limit=30&offset=0&sort=recent");
});

test("defaults: sem argumento nenhum vale a lista padrão recente", () => {
  assert.equal(articlesUrl(), "/api/articles?limit=200&offset=0&sort=recent");
});

test("ordem canônica das chaves: limit, offset, category, q, sort", () => {
  assert.equal(
    articlesUrl({ limit: 60, offset: 60, category: "politica", q: "chuva", sort: "views" }),
    "/api/articles?limit=60&offset=60&category=politica&q=chuva&sort=views");
});

test("category e q vazios não entram na query", () => {
  assert.equal(articlesUrl({ category: "", q: "" }), "/api/articles?limit=200&offset=0&sort=recent");
});

test("category e q são escapados", () => {
  assert.equal(
    articlesUrl({ limit: 5, category: "saúde & bem estar", q: "a=b&c" }),
    "/api/articles?limit=5&offset=0&category=sa%C3%BAde%20%26%20bem%20estar&q=a%3Db%26c&sort=recent");
});

test("limit=all continua expressável (depuração)", () => {
  assert.equal(articlesUrl({ limit: "all" }), "/api/articles?limit=all&offset=0&sort=recent");
});

test("isHomeRoute: só / e string vazia", () => {
  assert.equal(isHomeRoute("/"), true);
  assert.equal(isHomeRoute(""), true);
  assert.equal(isHomeRoute("/politica"), false);
  assert.equal(isHomeRoute("/artigo/x"), false);
});

test("listLimitForRoute: home pede a lista cheia; o resto, o ticker", () => {
  assert.equal(listLimitForRoute("/"), ARTICLES_LIST_LIMIT);
  assert.equal(listLimitForRoute("/politica"), ARTICLES_TICKER_LIMIT);
});
