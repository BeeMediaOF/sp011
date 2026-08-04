import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildArticleCardsHtml,
  parseArticleTokens,
  resolveArticleTokens,
  hasArticleTokens,
  type ArticleToken,
} from "../src/lib/newsletter/articleCards.ts";
import { sanitizeEmailHtml } from "../../../lib/news-engine/src/sanitizeHtml.ts";
// Helper do painel (sem React) — a suíte do api-server é a única que roda no
// Windows, então os puros do front são testados aqui por caminho relativo.
import {
  listHtmlImages,
  replaceHtmlImageSrc,
  isPendingSrc,
} from "../../brasilia-agora/src/lib/emailImages.ts";

const ART = [
  { id: "a1", slug: "guia-do-pbm-2026", title: "Guia do PBM 2026", category: "gestao", imageUrl: "/api/uploads/capa.jpg" },
  { id: "a2", slug: "icms-st-na-farmacia", title: "ICMS-ST na farmácia", category: "fiscal-tributario", imageUrl: "https://cdn.ext/x.jpg" },
];

test("card de artigo aponta para /artigo/<slug> e mostra categoria e CTA", () => {
  const html = buildArticleCardsHtml(ART, { accent: "#18a957", textColor: "#0e2341" });
  assert.ok(html.includes('href="/artigo/guia-do-pbm-2026"'), "link root-relativo pelo slug");
  assert.ok(html.includes('href="/artigo/icms-st-na-farmacia"'), "segundo artigo presente");
  assert.ok(html.includes("Guia do PBM 2026"), "título presente");
  assert.ok(html.includes("Gestao") || html.includes("Gestão"), "chip de categoria legível");
  assert.ok(html.includes("Ler artigo"), "CTA presente");
  assert.ok(html.includes("#18a957"), "usa a cor de destaque da campanha");
});

test("card usa o id quando o artigo não tem slug", () => {
  const html = buildArticleCardsHtml([{ id: "abc123", title: "Sem slug" }]);
  assert.ok(html.includes('href="/artigo/abc123"'), "cai no id");
});

test("miniatura: upload do blog pede versão reduzida; externa passa; data: sai fora", () => {
  const local = buildArticleCardsHtml([{ id: "1", slug: "s", title: "T", imageUrl: "/api/uploads/capa.jpg" }]);
  // `&amp;` e não `&`: dentro de atributo o e-comercial tem de vir escapado
  // (o cliente de e-mail desescapa e chama /api/uploads/capa.jpg?w=320&q=75).
  assert.ok(local.includes("/api/uploads/capa.jpg?w=320&amp;q=75"), "transform do /api/uploads aplicado");

  const ext = buildArticleCardsHtml([{ id: "1", slug: "s", title: "T", imageUrl: "https://cdn.ext/x.jpg" }]);
  assert.ok(ext.includes('src="https://cdn.ext/x.jpg"'), "URL externa intacta");

  const b64 = buildArticleCardsHtml([{ id: "1", slug: "s", title: "T", imageUrl: "data:image/png;base64,AAA" }]);
  assert.ok(!b64.includes("data:image"), "data-URI não vai para o e-mail");
  assert.ok(b64.includes("/artigo/s"), "sem thumb o card continua existindo");
});

test("sem artigos o gerador devolve vazio (nunca uma seção órfã)", () => {
  assert.equal(buildArticleCardsHtml([]), "");
});

// O card é montado no servidor mas volta pelo editor: se o usuário salvar a
// campanha, ele passa pelo sanitizador de e-mail. Nada pode se perder ali.
test("card sobrevive à sanitização de e-mail (tabela + estilo inline + link)", () => {
  const out = sanitizeEmailHtml(buildArticleCardsHtml(ART, { accent: "#18a957" }));
  assert.ok(out.includes('href="/artigo/guia-do-pbm-2026"'), "link preservado");
  assert.ok(out.includes("#18a957"), "cor inline preservada");
  assert.ok(out.includes('cellpadding="0"'), "atributo de tabela preservado");
  assert.ok(out.includes("border-radius:12px"), "estilo da miniatura preservado");
});

// O token é TEXTO dentro do corpo; se o sanitizador o mexesse, o envio nunca o
// encontraria (foi por isso que não viramos comentário HTML: aqueles somem).
test("token {{artigos:3}} atravessa a sanitização de e-mail intacto", () => {
  const out = sanitizeEmailHtml('<table><tr><td>{{artigos:3}}</td></tr></table>');
  assert.ok(out.includes("{{artigos:3}}"), "token intacto");
});

// ── Tokens ────────────────────────────────────────────────────────────────────

test("parseArticleTokens lê contagem, editoria e ordenação; clampa o N", () => {
  const t = parseArticleTokens(
    "<td>{{artigos:3}}</td><td>{{artigos:2:gestao}}</td><td>{{mais-lidos:99}}</td><td>{{ artigos : 4 }}</td>",
  );
  assert.equal(t.length, 4);
  assert.deepEqual(
    t.map((x) => [x.count, x.category, x.sort]),
    [[3, "", "recent"], [2, "gestao", "recent"], [6, "", "views"], [4, "", "recent"]],
    "clampa 99 em 6 e aceita espaço dentro do token",
  );
});

test("hasArticleTokens não confunde com outro texto entre chaves", () => {
  assert.equal(hasArticleTokens("<p>{{nome}} {{artigos}}</p>"), false);
  assert.equal(hasArticleTokens("<p>{{artigos:1}}</p>"), true);
});

test("resolveArticleTokens troca o token pelos cards e some com o marcador", async () => {
  const load = async (t: ArticleToken) => ART.slice(0, t.count);
  const out = await resolveArticleTokens("<td>antes {{artigos:2}} depois</td>", load, { accent: "#18a957" });
  assert.ok(!out.includes("{{artigos"), "marcador não sobra");
  assert.ok(out.includes("antes ") && out.includes(" depois"), "o resto do corpo fica");
  assert.ok(out.includes('href="/artigo/guia-do-pbm-2026"'), "cards no lugar do token");
});

test("token sem resultado vira vazio (nunca chega {{…}} ao inscrito)", async () => {
  const out = await resolveArticleTokens("<td>[{{artigos:3:inexistente}}]</td>", async () => []);
  assert.equal(out, "<td>[]</td>");
});

test("tokens idênticos buscam uma vez só; corpo sem token não busca nada", async () => {
  let calls = 0;
  const load = async (t: ArticleToken) => { calls++; return ART.slice(0, t.count); };
  await resolveArticleTokens("{{artigos:2}} … {{artigos:2}} … {{artigos:1}}", load);
  assert.equal(calls, 2, "duas assinaturas distintas, três ocorrências");

  calls = 0;
  const plain = "<p>sem token nenhum</p>";
  assert.equal(await resolveArticleTokens(plain, load), plain);
  assert.equal(calls, 0, "corpo sem token nem consulta o banco");
});

// ── Helper de imagens do painel ───────────────────────────────────────────────

const CORPO = [
  '<table><tr><td>',
  '<img src="COLOQUE_A_IMAGEM_AQUI" alt="logo" width="150" />',
  '<img data-src="/nao-eh-o-src" src=\'/api/uploads/nl-hero-ab12.jpg\' alt="hero">',
  '<img src="https://cdn.ext/foto.jpg" alt="capa da materia" />',
  '</td></tr></table>',
].join("");

test("listHtmlImages acha todas as imagens, o alt e o que está pendente", () => {
  const imgs = listHtmlImages(CORPO);
  assert.equal(imgs.length, 3, "três imagens");
  assert.deepEqual(imgs.map((i) => i.alt), ["logo", "hero", "capa da materia"]);
  assert.deepEqual(imgs.map((i) => i.pending), [true, false, false]);
  assert.equal(imgs[1]?.src, "/api/uploads/nl-hero-ab12.jpg", "aspas simples e data-src não confundem");
  // Os offsets têm de apontar exatamente para o valor do src.
  assert.equal(CORPO.slice(imgs[0]!.start, imgs[0]!.end), "COLOQUE_A_IMAGEM_AQUI");
  assert.equal(CORPO.slice(imgs[2]!.start, imgs[2]!.end), "https://cdn.ext/foto.jpg");
});

test("replaceHtmlImageSrc troca só a imagem pedida e não mexe no resto", () => {
  const out = replaceHtmlImageSrc(CORPO, 0, "/api/uploads/nl-logo-9c2f.png");
  assert.ok(out.includes('src="/api/uploads/nl-logo-9c2f.png"'), "src novo aplicado");
  assert.ok(!out.includes("COLOQUE_A_IMAGEM_AQUI"), "placeholder saiu");
  assert.ok(out.includes('alt="logo" width="150"'), "resto da tag intacto");
  assert.ok(out.includes("/api/uploads/nl-hero-ab12.jpg"), "as outras imagens não mudaram");
  assert.ok(out.includes("https://cdn.ext/foto.jpg"), "a terceira também não");
  // Diferença de tamanho = exatamente a diferença dos dois valores de src.
  assert.equal(out.length, CORPO.length - "COLOQUE_A_IMAGEM_AQUI".length + "/api/uploads/nl-logo-9c2f.png".length);
});

test("replaceHtmlImageSrc: índice fora da faixa não altera nada", () => {
  assert.equal(replaceHtmlImageSrc(CORPO, 9, "/x.png"), CORPO);
  assert.equal(replaceHtmlImageSrc("<p>sem imagem</p>", 0, "/x.png"), "<p>sem imagem</p>");
});

test("replaceHtmlImageSrc neutraliza aspas no valor novo", () => {
  const out = replaceHtmlImageSrc('<img src="a" alt="x">', 0, '/b".jpg');
  assert.ok(out.includes('src="/b&quot;.jpg"'), "aspa escapada — atributo não quebra");
  assert.ok(out.includes('alt="x"'), "tag continua bem formada");
});

test("isPendingSrc: só root-relativo e http(s) servem num e-mail", () => {
  assert.equal(isPendingSrc("/api/uploads/x.png"), false);
  assert.equal(isPendingSrc("https://x/y.png"), false);
  assert.equal(isPendingSrc("http://x/y.png"), false);
  assert.equal(isPendingSrc("COLOQUE_A_IMAGEM_AQUI"), true);
  assert.equal(isPendingSrc("{{img:hero}}"), true);
  assert.equal(isPendingSrc("  "), true);
  assert.equal(isPendingSrc("data:image/png;base64,AAA"), true);
});
