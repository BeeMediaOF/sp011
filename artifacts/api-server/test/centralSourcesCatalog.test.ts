/**
 * Catálogo de fontes RSS replicado do painel central (2026-08-14).
 *
 * Até aqui todo blog da rede nascia com 25 feeds do sp011 (Agência Brasil –
 * Política, Metrópoles, Jovem Pan, Correio Braziliense…) — marca de OUTRO
 * portal dentro da imagem compartilhada. Estes testes travam as duas coisas
 * que importam: o catálogo não pode voltar a conter aqueles feeds, e não pode
 * duplicar URL (a tabela `rss_sources` não tem UNIQUE em `url`, então a
 * dedupe é responsabilidade de quem insere).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CENTRAL_SOURCES_CATALOG } from "../src/lib/centralSourcesCatalog.ts";

/**
 * Os 11 feeds do antigo `DEFAULT_RSS_SOURCES` que a central NÃO coleta — esses
 * eram exclusividade do sp011 e não podem voltar por catálogo nenhum.
 *
 * Os outros 14 da lista antiga (Agência Brasil – Política/Internacional/
 * Economia/Cultura/Justiça, Carta Capital – Mundo, Metrópoles – Esportes/
 * Entretenimento/Saúde/Ciência/DF/Brasil, Correio Braziliense geral, InfoMoney
 * – Economia) CONTINUAM aparecendo no painel dos blogs de propósito: a central
 * os coleta de verdade, então espelhá-los é justamente o que foi pedido. Eles
 * chegam com o nome e a categoria da CENTRAL, não com os do sp011.
 */
const FEEDS_SO_DO_SP011 = [
  "https://www.correiobraziliense.com.br/politica/feed",
  "https://www.correiobraziliense.com.br/brasil/feed",
  "https://www.correiobraziliense.com.br/ciencia-e-saude/feed",
  "https://jovempan.com.br/noticias/politica/feed",
  "https://jovempan.com.br/noticias/mundo/feed",
  "https://jovempan.com.br/noticias/economia/feed",
  "https://jovempan.com.br/noticias/brasil/feed",
  "https://jovempan.com.br/esportes/feed",
  "https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",
  "https://jornaldebrasilia.com.br/brasilia/feed/",
  "https://www.noticiasaominuto.com.br/rss/tech",
];

test("catálogo não está vazio", () => {
  assert.ok(CENTRAL_SOURCES_CATALOG.length >= 50,
    `esperava dezenas de fontes, veio ${CENTRAL_SOURCES_CATALOG.length}`);
});

test("nenhuma URL repetida (a tabela do blog não tem UNIQUE em url)", () => {
  const urls = CENTRAL_SOURCES_CATALOG.map((s) => s.url);
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  assert.deepEqual(dup, [], `URLs duplicadas: ${dup.join(", ")}`);
});

test("os feeds exclusivos do sp011 não voltam pelo catálogo", () => {
  const urls = new Set(CENTRAL_SOURCES_CATALOG.map((s) => s.url));
  for (const feed of FEEDS_SO_DO_SP011) {
    assert.equal(urls.has(feed), false, `feed exclusivo do sp011 no catálogo: ${feed}`);
  }
});

// http:// é aceito porque o catálogo ESPELHA a central, que coleta um feed
// nigeriano publicado só em http (sources_ng.sql). Como tudo nasce inativo,
// ninguém busca nada até o operador ligar a fonte no painel.
test("toda fonte tem nome, URL http(s) e idioma conhecido", () => {
  for (const s of CENTRAL_SOURCES_CATALOG) {
    assert.ok(s.name.trim() !== "", `fonte sem nome: ${s.url}`);
    assert.match(s.url, /^https?:\/\//, `URL inválida: ${s.url}`);
    assert.ok(s.category.trim() !== "", `fonte sem categoria: ${s.url}`);
    assert.ok(s.language === "pt-BR" || s.language === "en", `idioma inválido em ${s.url}`);
  }
});

test("o catálogo cobre os nichos da rede (esporte, farmácia, finanças, EN)", () => {
  const cats = new Set(CENTRAL_SOURCES_CATALOG.map((s) => s.category));
  for (const esperada of ["futebol", "farmacia", "financas", "football"]) {
    assert.ok(cats.has(esperada), `categoria ausente no catálogo: ${esperada}`);
  }
  assert.ok(CENTRAL_SOURCES_CATALOG.some((s) => s.language === "en"),
    "nenhuma fonte em inglês — o ksports ficaria sem o catálogo dele");
});
