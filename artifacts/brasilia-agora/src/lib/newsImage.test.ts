/**
 * Testes dos helpers de asset de identidade (PRD-PERF-03). O ponto sensível é o
 * que o helper NÃO faz: mexer em data URI, URL externa ou caminho estático —
 * um `&w=` colado num `data:image/png;base64,…` quebra a imagem, e o mesmo campo
 * das settings ainda chega como data URI em blog não migrado ou localStorage
 * antigo. Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteAssetUrl, siteAssetSrcSet } from "./newsImage";

const ASSET = "/api/site-asset/logo?v=15f61d3a53";

test("siteAssetUrl: acrescenta w a uma URL de site-asset", () => {
  assert.equal(siteAssetUrl(ASSET, 320), "/api/site-asset/logo?v=15f61d3a53&w=320");
});

test("siteAssetUrl: substitui o w que o backend ja publicou", () => {
  assert.equal(
    siteAssetUrl("/api/site-asset/logo?v=abc&w=320", 640),
    "/api/site-asset/logo?v=abc&w=640",
  );
  // e nao duplica o parametro
  assert.equal(siteAssetUrl("/api/site-asset/logo?v=abc&w=320", 640).match(/w=/g)?.length, 1);
});

test("siteAssetUrl: preserva o ?v= (e o cache-buster da troca de logo no admin)", () => {
  assert.ok(siteAssetUrl(ASSET, 64).includes("v=15f61d3a53"));
});

test("siteAssetUrl: nao toca em data URI, URL externa nem caminho estatico", () => {
  const data = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(siteAssetUrl(data, 320), data);
  assert.equal(siteAssetUrl("https://cdn.exemplo.com/logo.png", 320), "https://cdn.exemplo.com/logo.png");
  assert.equal(siteAssetUrl("/favicon.jpg", 64), "/favicon.jpg");
  assert.equal(siteAssetUrl("", 64), "");
});

test("siteAssetUrl: URL de site-asset sem query nenhuma", () => {
  assert.equal(siteAssetUrl("/api/site-asset/favicon", 64), "/api/site-asset/favicon?w=64");
});

test("siteAssetSrcSet: 1x/2x, e undefined para o que nao e site-asset", () => {
  assert.equal(
    siteAssetSrcSet(ASSET, 320),
    "/api/site-asset/logo?v=15f61d3a53&w=320 1x, /api/site-asset/logo?v=15f61d3a53&w=640 2x",
  );
  assert.equal(siteAssetSrcSet("data:image/png;base64,AAA", 320), undefined);
  assert.equal(siteAssetSrcSet("/favicon.jpg", 64), undefined);
});

test("a URL derivada continua casando com a guarda do updateSettings", () => {
  /* store.ts ignora qualquer campo de imagem cujo valor comece com este prefixo:
     o admin lê as settings públicas (onde a imagem virou URL) e um PUT devolvendo
     esse ponteiro sobrescreveria o base64 real. Acrescentar &w= não pode mover o
     valor para fora do prefixo — este teste é o que o PRD-03 exige explicitamente. */
  const SITE_ASSET_PREFIX = "/api/site-asset/";
  for (const w of [32, 64, 320, 640]) {
    assert.ok(siteAssetUrl(ASSET, w).startsWith(SITE_ASSET_PREFIX));
    for (const cand of (siteAssetSrcSet(ASSET, w) ?? "").split(", ")) {
      assert.ok(cand.split(" ")[0]!.startsWith(SITE_ASSET_PREFIX));
    }
  }
});
