/**
 * Testes da classificação de rota do SSR (PRD-PERF-05). O que importa aqui é o
 * que NÃO pode virar HTML renderizado no servidor: o painel, os assets e a API.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySsrPath } from "./ssrRoutes";

test("home: / e /index.html", () => {
  assert.deepEqual(classifySsrPath("/"), { kind: "home", key: "home", slug: "" });
  assert.equal(classifySsrPath("/index.html")?.kind, "home");
  assert.equal(classifySsrPath("//")?.key, "home");
});

test("barra final fica com a SPA (o wouter do cliente pode casar outra rota)", () => {
  assert.equal(classifySsrPath("/politica/"), null);
  assert.equal(classifySsrPath("/artigo/algum-slug/"), null);
});

test("artigo: um segmento depois de /artigo", () => {
  assert.deepEqual(classifySsrPath("/artigo/lula-anuncia-pacote"), {
    kind: "article", key: "artigo:lula-anuncia-pacote", slug: "lula-anuncia-pacote",
  });
  // dois segmentos depois de /artigo não são rota do App
  assert.equal(classifySsrPath("/artigo/slug/extra")?.kind, "unknown");
  // /artigo sozinho não é artigo — é reservado (o resolveCategoryRoute recusa)
  assert.equal(classifySsrPath("/artigo")?.kind, "category");
});

test("editoria: candidato de um segmento só", () => {
  assert.deepEqual(classifySsrPath("/politica"), { kind: "category", key: "cat:politica", slug: "politica" });
  assert.equal(classifySsrPath("/futebol")?.slug, "futebol");
});

test("P-4: paginas institucionais tem rota propria e nunca sao editoria", () => {
  for (const p of ["/contato", "/termos", "/privacidade", "/arquivo"]) {
    assert.equal(classifySsrPath(p)?.kind, "static", p);
  }
});

test("P-5: path de dois ou mais segmentos nao existe no App", () => {
  /* Antes devolvia `null` e o fallback respondia 200 com o shell: era o
     soft-404 universal medido em produção (18 de 18 paths inventados = 200). */
  assert.equal(classifySsrPath("/a/b")?.kind, "unknown");
  assert.equal(classifySsrPath("/a/b/c")?.kind, "unknown");
  assert.equal(classifySsrPath("/caminho/de/dois")?.kind, "unknown");
});

test("P-6: caixa alta e candidato a editoria (quem decide a existencia e o dado)", () => {
  assert.equal(classifySsrPath("/FUTEBOL")?.kind, "category");
  assert.equal(classifySsrPath("/FUTEBOL")?.slug, "FUTEBOL");
});

test("o painel NUNCA é renderizado no servidor", () => {
  assert.equal(classifySsrPath("/admin"), null);
  assert.equal(classifySsrPath("/admin/"), null);
  assert.equal(classifySsrPath("/admin/login"), null);
  assert.equal(classifySsrPath("/admin/artigos/123"), null);
  // …mas um slug que só COMEÇA com "admin" é editoria normal
  assert.equal(classifySsrPath("/administrativo")?.kind, "category");
});

test("assets e API seguem o fluxo estático", () => {
  for (const p of ["/favicon.jpg", "/opengraph.jpg", "/sw.js", "/manifest.webmanifest",
                   "/assets/index-abc.css", "/fonts/inter-latin.woff2",
                   "/api/site", "/api/articles"]) {
    assert.equal(classifySsrPath(p), null, p);
  }
});
