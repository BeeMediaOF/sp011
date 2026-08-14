/**
 * Sincronização das fontes RSS vindas do painel central (2026-08-14).
 *
 * Até aqui a imagem instalava 25 feeds fixos do sp011 em TODO blog — um blog de
 * esporte exibia política do DF no painel. Agora quem manda a lista é a central,
 * que sabe pelas regras de distribuição quais fontes alimentam cada blog.
 *
 * O que está travado aqui é a única parte que APAGA dado: a decisão de remoção.
 * Fonte cadastrada à mão pelo operador, fonte ligada e fonte que já coletou
 * nunca podem sumir numa sincronização.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rssSourcesToRemove, type RssRowForPrune } from "../src/lib/rssCatalog.ts";

const row = (over: Partial<RssRowForPrune> & { id: string; url: string }): RssRowForPrune => ({
  active: false, lastFetchedAt: null, ...over,
});

test("remove o que a automação plantou e a central não manda mais", () => {
  const existentes = [
    row({ id: "1", url: "https://a.com/feed" }),
    row({ id: "2", url: "https://b.com/feed" }),
  ];
  const plantadas = new Set(["https://a.com/feed", "https://b.com/feed"]);
  const desejadas = new Set(["https://a.com/feed"]);
  assert.deepEqual(rssSourcesToRemove(existentes, desejadas, plantadas), ["2"]);
});

test("fonte cadastrada à mão NUNCA é removida (não está em plantadas)", () => {
  const existentes = [row({ id: "manual", url: "https://minhafonte.com/feed" })];
  assert.deepEqual(rssSourcesToRemove(existentes, new Set(), new Set()), []);
});

test("fonte LIGADA fica, mesmo saindo da lista da central", () => {
  const url = "https://a.com/feed";
  const existentes = [row({ id: "1", url, active: true })];
  assert.deepEqual(rssSourcesToRemove(existentes, new Set(), new Set([url])), []);
});

test("fonte que JÁ COLETOU fica (tem histórico amarrado a artigos)", () => {
  const url = "https://a.com/feed";
  const existentes = [row({ id: "1", url, lastFetchedAt: new Date("2026-07-01T00:00:00Z") })];
  assert.deepEqual(rssSourcesToRemove(existentes, new Set(), new Set([url])), []);
});

test("nada sai quando a central manda a mesma lista (idempotente)", () => {
  const urls = ["https://a.com/feed", "https://b.com/feed"];
  const existentes = urls.map((url, i) => row({ id: String(i), url }));
  const set = new Set(urls);
  assert.deepEqual(rssSourcesToRemove(existentes, set, set), []);
});

test("poda do legado: desejadas vazio remove só as antigas inativas e sem coleta", () => {
  const antigas = new Set(["https://jovempan.com.br/esportes/feed", "https://www.metropoles.com/brasil/feed"]);
  const existentes = [
    row({ id: "jp", url: "https://jovempan.com.br/esportes/feed" }),
    row({ id: "met", url: "https://www.metropoles.com/brasil/feed", lastFetchedAt: new Date() }),
    row({ id: "propria", url: "https://blogdocliente.com/feed" }),
  ];
  assert.deepEqual(rssSourcesToRemove(existentes, new Set(), antigas), ["jp"]);
});
