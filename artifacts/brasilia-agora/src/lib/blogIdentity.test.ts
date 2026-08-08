import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHost, brandNameFromHost, handleFromHost,
  blogDisplayName, blogTeamName, blogNewsroomName, blogUrlExample, blogEmailExample,
} from "./blogIdentity.ts";

test("normalizeHost tira protocolo, porta, caminho e www", () => {
  assert.equal(normalizeHost("https://www.ocomandante.midia.run/artigo/x"), "ocomandante.midia.run");
  assert.equal(normalizeHost("localhost:5173"), "localhost");
  assert.equal(normalizeHost("HTTP://Sp011.com.br?a=1"), "sp011.com.br");
  assert.equal(normalizeHost(""), "");
  assert.equal(normalizeHost(null), "");
});

test("brandNameFromHost usa só o primeiro rótulo e capitaliza cada palavra", () => {
  assert.equal(brandNameFromHost("ocomandante.midia.run"), "Ocomandante");
  assert.equal(brandNameFromHost("https://aposta-ganha.midia.run"), "Aposta Ganha");
  assert.equal(brandNameFromHost(""), "");
});

test("handleFromHost devolve arroba só com letras e números", () => {
  assert.equal(handleFromHost("aposta-ganha.midia.run"), "@apostaganha");
  assert.equal(handleFromHost(""), "");
});

test("blogDisplayName prefere o nome salvo e nunca inventa outra marca", () => {
  assert.equal(blogDisplayName("O Comandante News", "ocomandante.midia.run"), "O Comandante News");
  assert.equal(blogDisplayName("   ", "ocomandante.midia.run"), "Ocomandante");
  // Sem nome e sem host (SSR/teste): rótulo genérico, jamais um blog da rede.
  assert.equal(blogDisplayName("", ""), "Seu Portal");
});

test("derivados de nome carregam o blog certo", () => {
  assert.equal(blogTeamName("Receba Bet", ""), "Equipe Receba Bet");
  assert.equal(blogNewsroomName("", "recebabet.midia.run"), "Redação Recebabet");
});

test("exemplos de URL e e-mail saem do domínio do próprio blog", () => {
  assert.equal(blogUrlExample("ocomandante.midia.run"), "https://ocomandante.midia.run");
  assert.equal(blogUrlExample(""), "https://seudominio.com.br");
  assert.equal(blogEmailExample("redacao", "https://sp011.com.br/"), "redacao@sp011.com.br");
});
