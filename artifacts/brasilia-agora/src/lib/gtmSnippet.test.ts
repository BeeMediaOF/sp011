/**
 * GTM servido pelo servidor. O defeito que estes testes travam: o container
 * existia só como TEXTO dentro do JSON de hidratação (`"gtmId":"GTM-…"`), e o
 * verificador do GTM — um GET sem JS — acusava "container não encontrado".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeGtmId, gtmHeadTag, gtmBodyTag, containsGtmContainer, injectGtm,
} from "./gtmSnippet";

const ID = "GTM-NX23MQXR";

test("sanitizeGtmId: aceita o formato do container e normaliza a caixa", () => {
  assert.equal(sanitizeGtmId(ID), ID);
  assert.equal(sanitizeGtmId("  gtm-nx23mqxr  "), ID);
  assert.equal(sanitizeGtmId("GTM-P6QN99MB"), "GTM-P6QN99MB");
});

test("sanitizeGtmId: recusa o que quebraria o <script> ou injetaria HTML", () => {
  for (const ruim of [
    "", "   ", undefined, null,
    "G-XYZ123",                       // GA4, não GTM
    "GTM-",                           // sem container
    "GTM-ABC",                        // curto demais
    "GTM-ABC'</script><script>x()//", // tentativa de sair do script inline
    "GTM-ABC DEF",                    // espaço
    "<b>GTM-ABCDEF</b>",
  ]) {
    assert.equal(sanitizeGtmId(ruim as string), "", `deveria recusar: ${String(ruim)}`);
  }
});

test("gtmHeadTag: entrega tag EXECUTAVEL com o gtm.js do container", () => {
  const tag = gtmHeadTag(ID);
  assert.ok(tag.includes("https://www.googletagmanager.com/gtm.js?id='+i+dl"));
  assert.ok(tag.includes(`'dataLayer','${ID}'`));
  // é o que o verificador procura: script de verdade, não string em JSON
  assert.ok(tag.includes("<script>"));
});

test("gtmHeadTag: o container continua ASSINCRONO (nao volta a bloquear render)", () => {
  assert.ok(gtmHeadTag(ID).includes("j.async=true"));
});

test("gtmHeadTag: consentimento NEGADO antes do container carregar", () => {
  const tag = gtmHeadTag(ID);
  const posDefault = tag.indexOf("'consent','default'");
  const posContainer = tag.indexOf("gtm.start");
  assert.ok(posDefault > -1, "precisa declarar o consent default");
  assert.ok(posDefault < posContainer, "o default tem que vir ANTES do gtm.js");
  assert.ok(tag.includes("'analytics_storage':'denied'"));
  assert.ok(tag.includes("'ad_storage':'denied'"));
});

test("gtmHeadTag/gtmBodyTag: ID invalido nao injeta NADA", () => {
  assert.equal(gtmHeadTag(""), "");
  assert.equal(gtmHeadTag("G-ABC123"), "");
  assert.equal(gtmBodyTag(""), "");
});

test("gtmBodyTag: noscript com o iframe do proprio container", () => {
  const tag = gtmBodyTag(ID);
  assert.ok(tag.includes(`https://www.googletagmanager.com/ns.html?id=${ID}`));
  assert.ok(tag.startsWith("<!-- Google Tag Manager (noscript) -->"));
});

test("cada blog recebe o SEU container (nada cruzado)", () => {
  const a = gtmHeadTag("GTM-AAAA111");
  const b = gtmHeadTag("GTM-BBBB222");
  assert.ok(a.includes("GTM-AAAA111") && !a.includes("GTM-BBBB222"));
  assert.ok(b.includes("GTM-BBBB222") && !b.includes("GTM-AAAA111"));
});

test("containsGtmContainer: pega o snippet colado no codigo personalizado", () => {
  const colado = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','${ID}');</script>`;
  assert.equal(containsGtmContainer(colado, ID), true);
  // container DIFERENTE é código legítimo do operador — não pode ser pulado
  assert.equal(containsGtmContainer(colado, "GTM-OUTRO123"), false);
  assert.equal(containsGtmContainer("<script>hotjar()</script>", ID), false);
  assert.equal(containsGtmContainer("", ID), false);
  assert.equal(containsGtmContainer(colado, ""), false);
});

/* ── Injeção no documento real ──────────────────────────────────────────────
   Contra o index.html do próprio projeto: é ele que o servidor reescreve, e um
   template sem `</head>` ou sem `<body>` faria o replace virar no-op silencioso
   — exatamente o tipo de falha que deixou o container invisível por semanas. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
);

test("injectGtm: o index.html real tem as ancoras que o replace precisa", () => {
  assert.ok(TEMPLATE.includes("</head>"), "sem </head> o script nao entraria");
  assert.match(TEMPLATE, /<body[^>]*>/, "sem <body> o noscript nao entraria");
});

test("injectGtm: script dentro do <head> e noscript logo apos o <body>", () => {
  const out = injectGtm(TEMPLATE, ID);
  const fimHead = out.indexOf("</head>");
  const abreBody = out.search(/<body[^>]*>/);

  const posScript = out.indexOf("gtm.start");
  assert.ok(posScript > -1 && posScript < fimHead, "o carregador tem que ficar no <head>");

  const posNoscript = out.indexOf("ns.html?id=");
  assert.ok(posNoscript > abreBody, "o noscript tem que ficar depois da abertura do <body>");
  assert.ok(posNoscript > fimHead, "e fora do <head>");

  // e nada de duplicar: um container, um carregador
  assert.equal(out.split("gtm.start").length - 1, 1);
});

test("injectGtm: sem ID valido o HTML sai IDENTICO", () => {
  assert.equal(injectGtm(TEMPLATE, ""), TEMPLATE);
  assert.equal(injectGtm(TEMPLATE, "G-ABC123"), TEMPLATE);
});

test("injectGtm: dois blogs, dois containers, sem cruzar", () => {
  const a = injectGtm(TEMPLATE, "GTM-AAAA111");
  const b = injectGtm(TEMPLATE, "GTM-BBBB222");
  assert.ok(a.includes("GTM-AAAA111") && !a.includes("GTM-BBBB222"));
  assert.ok(b.includes("GTM-BBBB222") && !b.includes("GTM-AAAA111"));
});

test("gtmHeadTag: o container sai do caminho critico sem sair do HTML", () => {
  const tag = gtmHeadTag(ID);
  // O que o verificador do GTM le num GET simples continua exatamente ali —
  // esta e a correcao de 2026-08-14, que NAO pode ser desfeita.
  assert.ok(tag.includes("https://www.googletagmanager.com/gtm.js?id='+i+dl"));
  assert.ok(tag.includes("<!-- Google Tag Manager -->"));
  // ...mas a BUSCA do arquivo espera a pagina terminar de carregar.
  assert.ok(tag.includes("function go()"));
  assert.ok(tag.includes("addEventListener('load',go"));
  // Teto: visitante que sai antes do load ainda carrega o container.
  assert.ok(tag.includes("setTimeout(go,3000)"));
  assert.ok(tag.includes("pointerdown"));
  assert.ok(tag.includes("visibilitychange"));
  // Uma vez so, venha o gatilho que vier.
  assert.ok(tag.includes("if(feito)return;feito=true;"));
});
