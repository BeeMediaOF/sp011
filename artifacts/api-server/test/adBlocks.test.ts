/**
 * Testes da varredura de blocos marcados "É uma propaganda".
 *
 * Existe porque o teste das ROTAS (routesAds.test.ts) injeta `findAdBlock` como
 * mock: a enumeração real das zonas nunca era exercitada, e a suíte passava
 * verde com uma zona faltando. O sintoma em produção seria mudo — evento aceito
 * e descartado, ou gravado no banco e ausente do painel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { findAdBlockIn, listAdBlocks, AD_BLOCK_ZONES, HEADER_BANNER_BLOCK_ID } =
  await import("../src/lib/adBlocks.ts");

const ad = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: `Bloco ${id}`, isAd: true, ...over });

test("as três zonas de blocos são varridas — home, lateral e fim da notícia", () => {
  const s = {
    homeBlocks:           [ad("home-1")],
    articleSidebarBlocks: [ad("lat-1")],
    articleFooterBlocks:  [ad("rod-1")],
  };
  for (const id of ["home-1", "lat-1", "rod-1"]) {
    assert.deepEqual(findAdBlockIn(s, id), { visible: true }, `${id} deveria ser inventário válido`);
  }
  assert.equal(listAdBlocks(s).length, 3);
});

test("bloco sem isAd não é inventário — o evento tem de ser descartado", () => {
  const s = { articleFooterBlocks: [{ id: "rod-1", name: "Banner" }] };
  assert.equal(findAdBlockIn(s, "rod-1"), null);
  assert.deepEqual(listAdBlocks(s), []);
});

test("id desconhecido devolve null em vez de aceitar a métrica", () => {
  assert.equal(findAdBlockIn({ homeBlocks: [ad("home-1")] }, "inventado"), null);
  assert.equal(findAdBlockIn({}, "qualquer"), null);
});

test("bloco oculto continua sendo inventário, mas marcado inativo", () => {
  const s = { articleFooterBlocks: [ad("rod-1", { visible: false })] };
  assert.deepEqual(findAdBlockIn(s, "rod-1"), { visible: false });
  assert.equal(listAdBlocks(s)[0]?.active, false);
});

test("banner do cabeçalho é pseudo-bloco: vale só quando há HTML", () => {
  assert.deepEqual(
    findAdBlockIn({ headerBannerHtml: "<div>x</div>" }, HEADER_BANNER_BLOCK_ID),
    { visible: true },
  );
  assert.equal(findAdBlockIn({ headerBannerHtml: "   " }, HEADER_BANNER_BLOCK_ID), null);
  assert.equal(findAdBlockIn({}, HEADER_BANNER_BLOCK_ID), null);
});

test("a posição do relatório vem da zona de origem, não é literal fixo", () => {
  const rows = listAdBlocks({
    homeBlocks:           [ad("home-1")],
    articleSidebarBlocks: [ad("lat-1")],
    articleFooterBlocks:  [ad("rod-1")],
  });
  const pos = Object.fromEntries(rows.map((r) => [r.id, r.position]));
  assert.equal(pos["home-1"], "bloco da home");
  assert.equal(pos["lat-1"],  "lateral da notícia");
  assert.equal(pos["rod-1"],  "fim da notícia");
  // Rótulos distintos entre si: é o campo pelo qual o operador filtra.
  assert.equal(new Set(AD_BLOCK_ZONES.map((z) => z.label)).size, AD_BLOCK_ZONES.length);
});

test("id repetido entre zonas não duplica a linha do relatório", () => {
  const rows = listAdBlocks({
    homeBlocks:          [ad("mesmo-id")],
    articleFooterBlocks: [ad("mesmo-id")],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.position, "bloco da home", "a primeira zona vence, como em findAdBlockIn");
});

test("toda zona declarada é de fato varrida pelas duas funções", () => {
  // Guarda contra o defeito original: zona acrescentada ao tipo e esquecida na
  // varredura. Monta um settings sintético com um bloco por zona declarada.
  const s: Record<string, unknown> = {};
  for (const z of AD_BLOCK_ZONES) s[z.key] = [ad(`x-${z.key}`)];
  assert.equal(listAdBlocks(s).length, AD_BLOCK_ZONES.length);
  for (const z of AD_BLOCK_ZONES) {
    assert.deepEqual(findAdBlockIn(s, `x-${z.key}`), { visible: true }, `zona ${z.key} não é varrida`);
  }
});
