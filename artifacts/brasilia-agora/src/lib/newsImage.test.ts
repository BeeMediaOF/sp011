/**
 * Testes dos helpers de asset de identidade (PRD-PERF-03). O ponto sensível é o
 * que o helper NÃO faz: mexer em data URI, URL externa ou caminho estático —
 * um `&w=` colado num `data:image/png;base64,…` quebra a imagem, e o mesmo campo
 * das settings ainda chega como data URI em blog não migrado ou localStorage
 * antigo. Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteAssetUrl, siteAssetSrcSet, coverSrcSet, buildSrcSet, aspectClass } from "./newsImage";

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

test("siteAssetUrl: h troca o eixo e nao deixa w para tras", () => {
  /* Logo é dimensionada por ALTURA: o CSS fixa style={{ height }} e a largura
     sai da proporção, que só o servidor conhece. Se o w publicado sobrevivesse
     junto do h, o sharp receberia os dois e distorceria/cortaria a marca. */
  const url = siteAssetUrl("/api/site-asset/logo?v=abc&w=320", { h: 120 });
  assert.equal(url, "/api/site-asset/logo?v=abc&h=120");
  assert.equal(url.includes("w="), false);
  // e o caminho inverso também limpa
  assert.equal(siteAssetUrl("/api/site-asset/logo?v=abc&h=120", { w: 64 }), "/api/site-asset/logo?v=abc&w=64");
});

test("siteAssetSrcSet: dobra preservando o eixo pedido", () => {
  assert.equal(
    siteAssetSrcSet("/api/site-asset/logo?v=abc", { h: 120 }),
    "/api/site-asset/logo?v=abc&h=120 1x, /api/site-asset/logo?v=abc&h=240 2x",
  );
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

/* ── Recorte no servidor (coverSrcSet) ──────────────────────────────────────
   O card 3:4 preenchido por foto 16:9 precisa de ~2,4x a largura da caixa para
   cobrir a altura. Enquanto o srcSet pedia só a largura, o navegador ampliava
   2,2x — foi o borrão do oleysports. Pedindo w+h+fit=cover, o servidor devolve
   a caixa pronta. */

const CENTRAL = "https://central.midia.run/api/news/image/abc-123.jpg";

test("coverSrcSet: cada candidato leva h na proporcao da caixa e fit=cover", () => {
  const set = coverSrcSet(CENTRAL, "3/4", [320, 640]);
  const partes = set.split(", ");
  assert.equal(partes.length, 2);
  assert.match(partes[0]!, /[?&]w=320&h=427&q=86&fit=cover 320w$/);
  assert.match(partes[1]!, /[?&]w=640&h=853&q=86&fit=cover 640w$/);
  // a URL de origem vai escapada (querystring dentro de querystring)
  assert.ok(partes[0]!.includes(encodeURIComponent(CENTRAL)));
});

test("coverSrcSet: a altura acompanha a proporcao pedida", () => {
  assert.match(coverSrcSet(CENTRAL, "16/9", [640]), /h=360&/);
  assert.match(coverSrcSet(CENTRAL, "4/3", [640]), /h=480&/);
  assert.match(coverSrcSet(CENTRAL, "16/6", [1280]), /h=480&/);
});

test("coverSrcSet: acende exatamente nos mesmos casos que buildSrcSet", () => {
  /* Os componentes assumem isso: como os dois têm a MESMA condição de host, o
     `sizes` pode ser sempre a largura da caixa. Se um acendesse sem o outro,
     existiria um caso com srcSet por largura e sizes de caixa — borrão de novo. */
  for (const src of [
    CENTRAL,
    "https://a1.espncdn.com/foto.jpg",
    "https://dominio-nao-permitido.com/foto.jpg",
    "/api/uploads/capa.jpg",
    "/assets/estatico.png",
    "data:image/png;base64,AAAA",
    "",
  ]) {
    assert.equal(
      coverSrcSet(src, "3/4") === "",
      buildSrcSet(src, [320, 640]) === "",
      `divergiram em ${src || "(vazio)"}`,
    );
  }
});

test("coverSrcSet: upload do painel usa o resize do proprio /api/uploads", () => {
  const set = coverSrcSet("/api/uploads/capa.jpg", "3/4", [320]);
  assert.equal(set, "/api/uploads/capa.jpg?w=320&h=427&q=86&f=webp&fit=cover 320w");
});

test("aspectClass: a classe do Tailwind sai da MESMA fonte do srcSet", () => {
  assert.equal(aspectClass("3/4"), "aspect-[3/4]");
  assert.equal(aspectClass("16/10"), "aspect-[16/10]");
});
