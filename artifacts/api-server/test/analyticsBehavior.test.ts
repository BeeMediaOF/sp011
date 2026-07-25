import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBehaviorStats, type BehaviorRowLike } from "../src/lib/analyticsShared.ts";

// PRD 07 — agregação de comportamento (buscas, cliques externos, newsletter).
// Função pura: tops truncados (15/10) + totais NÃO truncados na mesma passada.

const sumTop = (arr: { count: number }[]): number => arr.reduce((a, x) => a + x.count, 0);

test("CA5: truncagem vs total — 20 termos → top-15 mas searchesTotal 20; 12 domínios → top-10 mas total 12", () => {
  const searchRows: BehaviorRowLike[] = [];
  for (let i = 0; i < 20; i++) searchRows.push({ eventType: "search", value: `termo${i}`, isInternal: false });
  const s = buildBehaviorStats(searchRows);
  assert.equal(s.topSearchTerms.length, 15);
  assert.equal(s.searchesTotal, 20);
  assert.equal(s.searchTermsDistinct, 20);
  assert.ok(sumTop(s.topSearchTerms) < s.searchesTotal); // 15 < 20: bug do item 24 impossível

  const clickRows: BehaviorRowLike[] = [];
  for (let i = 0; i < 12; i++) clickRows.push({ eventType: "link_click", value: `https://d${i}.com/x`, isInternal: false });
  const c = buildBehaviorStats(clickRows);
  assert.equal(c.topLinkDomains.length, 10);
  assert.equal(c.externalClicksTotal, 12);
  assert.equal(c.linkDomainsDistinct, 12);
  assert.ok(sumTop(c.topLinkDomains) < c.externalClicksTotal); // 10 < 12
});

test("R07-1 com igualdade: 5 termos / 4 domínios cabem no top → Σ top === total", () => {
  const rows: BehaviorRowLike[] = [
    ...["a", "b", "c", "d", "e"].map((t): BehaviorRowLike => ({ eventType: "search", value: t })),
    ...["x.com", "y.com", "z.com", "w.com"].map((d): BehaviorRowLike => ({ eventType: "link_click", value: `https://${d}/p` })),
  ];
  const s = buildBehaviorStats(rows);
  assert.equal(sumTop(s.topSearchTerms), s.searchesTotal);        // 5 === 5
  assert.equal(sumTop(s.topLinkDomains), s.externalClicksTotal);  // 4 === 4
});

test("CA6 link_click: mailto/tel/javascript/vazio/null/https-sem-host excluídos; só http(s) com host entra", () => {
  const rows: BehaviorRowLike[] = [
    { eventType: "link_click", value: "mailto:a@b.c" },
    { eventType: "link_click", value: "tel:+5511999999999" },
    { eventType: "link_click", value: "javascript:void(0)" },
    { eventType: "link_click", value: "" },
    { eventType: "link_click", value: null },
    { eventType: "link_click", value: "https://" },               // esquema ok, host vazio → inválido
    { eventType: "link_click", value: "HTTPS://www.Ex.com/x" },    // única válida
  ];
  const s = buildBehaviorStats(rows);
  assert.equal(s.externalClicksTotal, 1);
  assert.equal(s.topLinkDomains.length, 1);
  assert.equal(s.topLinkDomains[0]?.domain, "ex.com");            // www. removido, lowercase pelo URL
  assert.ok(!s.topLinkDomains.some((d) => d.domain === ""));       // R07-3: nenhum domínio vazio
  assert.equal(s.totalEvents, 7);                                  // TODAS as linhas contam como evento
});

test("CA6 search: só-espaços e null excluídos; '  Flamengo ' normaliza para 'flamengo'", () => {
  const rows: BehaviorRowLike[] = [
    { eventType: "search", value: "  " },
    { eventType: "search", value: null },
    { eventType: "search", value: "  Flamengo " },
  ];
  const s = buildBehaviorStats(rows);
  assert.equal(s.searchesTotal, 1);
  assert.equal(s.topSearchTerms.length, 1);
  assert.equal(s.topSearchTerms[0]?.term, "flamengo");
  assert.equal(s.totalEvents, 3);
});

test("CA7: isInternal:true fora de TUDO; undefined e null contam como não-interno", () => {
  const rows: BehaviorRowLike[] = [
    { eventType: "search", value: "publico", isInternal: false },
    { eventType: "search", value: "interno", isInternal: true },
    { eventType: "link_click", value: "https://a.com/x", isInternal: true },
    { eventType: "newsletter", value: "a@b.c", isInternal: true },
    { eventType: "search", value: "sem-flag" },                    // undefined → conta
    { eventType: "search", value: "flag-null", isInternal: null }, // null → conta
  ];
  const s = buildBehaviorStats(rows);
  assert.equal(s.totalEvents, 3);
  assert.equal(s.searchesTotal, 3);
  assert.equal(s.externalClicksTotal, 0);
  assert.equal(s.newsletterSignups, 0);
  assert.ok(!s.topSearchTerms.some((t) => t.term === "interno"));
});

test("newsletter: conta por linha (independe de value), exclui interno", () => {
  const rows: BehaviorRowLike[] = [
    { eventType: "newsletter", value: "a@b.c" },
    { eventType: "newsletter", value: null },
    { eventType: "newsletter", value: "x@y.z", isInternal: true },
  ];
  const s = buildBehaviorStats(rows);
  assert.equal(s.newsletterSignups, 2);
});

test("R07-2: totalEvents >= searchesTotal + externalClicksTotal + newsletterSignups (reservados/inválidos na folga)", () => {
  const rows: BehaviorRowLike[] = [
    { eventType: "search", value: "a" },
    { eventType: "link_click", value: "https://x.com/1" },
    { eventType: "newsletter", value: "e@e.e" },
    { eventType: "video_play", value: "vid1" },        // reservado (PRD 01 RF6)
    { eventType: "download", value: "f.pdf" },         // reservado
    { eventType: "link_click", value: "mailto:z@z.z" },// inválido
    { eventType: "search", value: "  " },              // termo vazio
  ];
  const s = buildBehaviorStats(rows);
  assert.ok(s.totalEvents >= s.searchesTotal + s.externalClicksTotal + s.newsletterSignups);
  assert.equal(s.totalEvents, 7);
  assert.equal(s.searchesTotal, 1);
  assert.equal(s.externalClicksTotal, 1);
  assert.equal(s.newsletterSignups, 1);
});

test("CA3 shape: exatamente as 8 chaves do contrato BehaviorStats; janela vazia zera tudo", () => {
  const s = buildBehaviorStats([]);
  assert.deepEqual(
    Object.keys(s).sort(),
    [
      "externalClicksTotal", "linkDomainsDistinct", "newsletterSignups",
      "searchTermsDistinct", "searchesTotal", "topLinkDomains",
      "topSearchTerms", "totalEvents",
    ],
  );
  assert.equal(s.totalEvents, 0);
  assert.equal(s.searchesTotal, 0);
  assert.equal(s.externalClicksTotal, 0);
  assert.equal(s.newsletterSignups, 0);
  assert.equal(s.searchTermsDistinct, 0);
  assert.equal(s.linkDomainsDistinct, 0);
  assert.deepEqual(s.topSearchTerms, []);
  assert.deepEqual(s.topLinkDomains, []);
});
