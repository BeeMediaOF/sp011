import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSitemapXml, canonicalArticleSlug, hasForeignCanonical, indexableCategoryPaths,
  escapeXml, SITEMAP_MAX_URLS, type SitemapArticle,
} from "../src/lib/sitemapXml.ts";

// P0 de indexacao: o sitemap anunciava 14 URLs fixas (12 de editorias de outro
// portal) e ZERO artigos, num blog com 644 publicados. O que estes testes fixam
// e a regra de ouro: nada que redirecione, responda 404 ou carregue noindex
// pode ser publicado aqui.

const BASE = "https://oleysports.com.br";
const UUID = "ce9ce8e2-68be-4ecf-8c7f-88d1e476607f";

function art(p: Partial<SitemapArticle>): SitemapArticle {
  return { id: UUID, slug: "materia-x", publishedAt: new Date("2026-08-20T10:00:00Z"), canonicalUrl: null, ...p };
}

test("M-1: so os artigos recebidos entram (o filtro de publicados e da consulta)", () => {
  const r = buildSitemapXml({
    base: BASE,
    articles: [art({ id: "1", slug: "a" }), art({ id: "2", slug: "b" }), art({ id: "3", slug: "c" })],
    categorySlugs: [],
  });
  assert.equal(r.articleCount, 3);
  assert.equal((r.xml.match(/\/artigo\//g) ?? []).length, 3);
});

test("M-2: com slug e id, a URL usa o SLUG (o UUID responderia 301)", () => {
  const r = buildSitemapXml({ base: BASE, articles: [art({ slug: "futebol-x" })], categorySlugs: [] });
  assert.ok(r.xml.includes(`${BASE}/artigo/futebol-x`));
  assert.ok(!r.xml.includes(UUID));
});

test("M-3: artigo sem slug cai no id (a URL canonica dele E o UUID)", () => {
  const r = buildSitemapXml({ base: BASE, articles: [art({ slug: null })], categorySlugs: [] });
  assert.ok(r.xml.includes(`${BASE}/artigo/${UUID}`));
  const r2 = buildSitemapXml({ base: BASE, articles: [art({ slug: "   " })], categorySlugs: [] });
  assert.ok(r2.xml.includes(`${BASE}/artigo/${UUID}`));
});

test("M-4: canonical apontando para OUTRO host tira a materia do sitemap", () => {
  const r = buildSitemapXml({
    base: BASE,
    articles: [art({ slug: "a", canonicalUrl: "https://outro-portal.com/artigo/a" })],
    categorySlugs: [],
  });
  assert.equal(r.articleCount, 0);
  // canonical do PROPRIO host nao exclui
  const r2 = buildSitemapXml({
    base: BASE,
    articles: [art({ slug: "a", canonicalUrl: `${BASE}/artigo/a` })],
    categorySlugs: [],
  });
  assert.equal(r2.articleCount, 1);
  // canonical invalido nao esconde a materia
  assert.equal(hasForeignCanonical(art({ canonicalUrl: "nao-e-url" }), BASE), false);
});

test("M-5: caracteres especiais sao escapados e o slug sai percent-encoded", () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), "a &amp; b &lt; c &gt; d &quot; e &apos; f");
  const r = buildSitemapXml({ base: BASE, articles: [art({ slug: "thiagog silva" })], categorySlugs: [] });
  assert.ok(r.xml.includes("/artigo/thiagog%20silva"));
});

test("M-6/M-7: editoria vazia fica de fora; a lista recebida ja e a das COM conteudo", () => {
  const r = buildSitemapXml({ base: BASE, articles: [], categorySlugs: ["futebol", "copa-do-mundo", "tebol"] });
  assert.ok(r.xml.includes(`${BASE}/futebol`));
  assert.ok(r.xml.includes(`${BASE}/copa-do-mundo`));
  assert.ok(r.xml.includes(`${BASE}/tebol`));
  assert.ok(!r.xml.includes(`${BASE}/basquete`));
});

test("rota reservada nunca vira editoria no sitemap, mesmo vindo do banco", () => {
  assert.deepEqual(indexableCategoryPaths(["contato", "artigo", "termos", "futebol"]), ["/futebol"]);
  // e slug malformado (espaco, caixa alta, dois segmentos) tambem nao entra
  assert.deepEqual(indexableCategoryPaths(["Copa Do Mundo", "a/b", "", "  ", "f1"]), ["/f1"]);
  // sem duplicata
  assert.deepEqual(indexableCategoryPaths(["futebol", "futebol"]), ["/futebol"]);
});

test("M-8: acima do limite do protocolo corta e informa quantas ficaram de fora", () => {
  const many = Array.from({ length: SITEMAP_MAX_URLS + 10 }, (_, i) => art({ id: `id-${i}`, slug: `s-${i}` }));
  const r = buildSitemapXml({ base: BASE, articles: many, categorySlugs: ["futebol"] });
  assert.ok(r.articleCount < SITEMAP_MAX_URLS);
  assert.equal(r.articleCount + r.truncated, many.length);
  const total = (r.xml.match(/<loc>/g) ?? []).length;
  assert.ok(total <= SITEMAP_MAX_URLS, `total de <loc> = ${total}`);
});

test("M-10: lastmod sai de publishedAt (updatedAt e carimbado por manutencao em lote)", () => {
  const r = buildSitemapXml({
    base: BASE,
    articles: [art({ publishedAt: new Date("2026-08-14T23:30:00Z") })],
    categorySlugs: [],
  });
  assert.ok(r.xml.includes("<lastmod>2026-08-14</lastmod>"));
  // data ausente ou invalida simplesmente omite a tag
  const semData = buildSitemapXml({ base: BASE, articles: [art({ publishedAt: null })], categorySlugs: [] });
  assert.ok(!semData.xml.includes("<lastmod>"));
  const ruim = buildSitemapXml({ base: BASE, articles: [art({ publishedAt: "nao-e-data" })], categorySlugs: [] });
  assert.ok(!ruim.xml.includes("<lastmod>"));
});

test("home e institucionais entram; nenhuma editoria de outro portal aparece", () => {
  const r = buildSitemapXml({ base: BASE, articles: [], categorySlugs: ["futebol"] });
  for (const p of ["/", "/arquivo", "/contato", "/privacidade", "/termos", "/futebol"]) {
    assert.ok(r.xml.includes(`<loc>${BASE}${p}</loc>`), p);
  }
  // as 12 editorias fixas do sp011 nao existem mais como lista embutida
  for (const p of ["/politica", "/cidade", "/seguranca", "/transporte", "/colunas", "/brasil"]) {
    assert.ok(!r.xml.includes(`<loc>${BASE}${p}</loc>`), p);
  }
});

test("o host vem do parametro: nenhum dominio embutido no codigo", () => {
  const r = buildSitemapXml({ base: "https://sp011.com.br/", articles: [art({ slug: "x" })], categorySlugs: ["politica"] });
  assert.ok(r.xml.includes("<loc>https://sp011.com.br/artigo/x</loc>"));
  assert.ok(r.xml.includes("<loc>https://sp011.com.br/politica</loc>"));
  // barra final do base nao duplica
  assert.ok(!r.xml.includes("sp011.com.br//"));
});

test("XML valido: declaracao, urlset e fechamento", () => {
  const r = buildSitemapXml({ base: BASE, articles: [art({ slug: "x" })], categorySlugs: ["futebol"] });
  assert.ok(r.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(r.xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(r.xml.trimEnd().endsWith("</urlset>"));
  assert.equal((r.xml.match(/<loc>/g) ?? []).length, (r.xml.match(/<\/loc>/g) ?? []).length);
});

test("canonicalArticleSlug: slug vence o id e espaco em branco nao conta", () => {
  assert.equal(canonicalArticleSlug(art({ slug: "a-b" })), "a-b");
  assert.equal(canonicalArticleSlug(art({ slug: null })), UUID);
  assert.equal(canonicalArticleSlug(art({ slug: "", id: "" })), "");
});
