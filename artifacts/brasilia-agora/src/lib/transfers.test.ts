/**
 * Testes da apresentação do módulo de Transferências.
 *
 * O formatador de dinheiro é o motivo destes testes existirem: ele NÃO usa
 * `Intl` porque o ICU do Node e o do navegador podem divergir, e divergência
 * entre SSR e hidratação é o React #418 (já custou o LCP da home uma vez).
 * Um formatador próprio só compensa se for provado — é o que está aqui.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney, formatMoneyShort, clubMonogram, probabilityTier,
  formatInfoDate, positionKey, TRANSFER_POSITIONS,
  transferPhotoUrl, transferCrestUrl,
} from "./transfers";

test("dinheiro em pt-BR: simbolo, espaco e ponto de milhar", () => {
  assert.equal(formatMoney(80_000_000, "EUR"), "€ 80.000.000");
  assert.equal(formatMoney(1_500, "BRL"), "R$ 1.500");
  assert.equal(formatMoney(999, "BRL"), "R$ 999");
  assert.equal(formatMoney(1_000, "GBP"), "£ 1.000");
  assert.equal(formatMoney(12_345_678_901, "USD"), "US$ 12.345.678.901");
});

test("dinheiro em ingles: sem espaco, virgula de milhar e dolar seco", () => {
  assert.equal(formatMoney(80_000_000, "EUR", "en"), "€80,000,000");
  assert.equal(formatMoney(1_500, "USD", "en"), "$1,500");
  assert.equal(formatMoney(1_500, "USD"), "US$ 1.500"); // pt distingue do dólar local
  assert.equal(formatMoney(250, "GBP", "en"), "£250");
});

test("dinheiro ausente ou invalido some, em vez de virar NaN no card", () => {
  assert.equal(formatMoney(undefined), "");
  assert.equal(formatMoney(null), "");
  assert.equal(formatMoney(NaN), "");
  assert.equal(formatMoney(Infinity), "");
  assert.equal(formatMoney(-1), "");
  assert.equal(formatMoney(0), "€ 0");
});

test("forma curta: milhao e bilhao, com decimal so quando ele diz algo", () => {
  assert.equal(formatMoneyShort(80_000_000, "EUR"), "€ 80 mi");
  assert.equal(formatMoneyShort(1_500_000_000, "EUR"), "€ 1,5 bi");
  assert.equal(formatMoneyShort(1_500_000, "BRL"), "R$ 1,5 mi");
  assert.equal(formatMoneyShort(80_000_000, "EUR", "en"), "€80M");
  assert.equal(formatMoneyShort(1_500_000_000, "EUR", "en"), "€1.5B");
  // abaixo de 1 milhão a forma curta seria PIOR que a cheia
  assert.equal(formatMoneyShort(800_000, "EUR"), "€ 800.000");
  assert.equal(formatMoneyShort(undefined), "");
});

test("monograma: as iniciais que substituem o escudo ausente", () => {
  assert.equal(clubMonogram("Real Madrid"), "RM");
  assert.equal(clubMonogram("Manchester City"), "MC");
  assert.equal(clubMonogram("Borussia Dortmund"), "BD");
  assert.equal(clubMonogram("Atlético de Madrid"), "AM"); // "de" não conta
  assert.equal(clubMonogram("Vasco da Gama"), "VG");
  assert.equal(clubMonogram("Flamengo"), "FL");          // uma palavra: 2 letras
  assert.equal(clubMonogram("São Paulo"), "SP");
  assert.equal(clubMonogram("F.C. Porto"), "FP");        // sigla é ignorada
  assert.equal(clubMonogram(""), "?");
  assert.equal(clubMonogram(undefined), "?");
  // clube cujo nome é SÓ uma sigla continua tendo monograma
  assert.equal(clubMonogram("PSV"), "PS");
});

test("faixa do selo de probabilidade", () => {
  assert.equal(probabilityTier(100), "high");
  assert.equal(probabilityTier(70), "high");
  assert.equal(probabilityTier(69), "medium");
  assert.equal(probabilityTier(45), "medium");
  assert.equal(probabilityTier(44), "low");
  assert.equal(probabilityTier(0), "low");
});

test("data da informacao sem passar por Date (fuso negativo comia um dia)", () => {
  assert.equal(formatInfoDate("2025-05-25"), "25/05/2025");
  assert.equal(formatInfoDate("2025-05-25", "en"), "05/25/2025");
  assert.equal(formatInfoDate("2025-05-25T23:30:00Z"), "25/05/2025");
  assert.equal(formatInfoDate(""), "");
  assert.equal(formatInfoDate(undefined), "");
  assert.equal(formatInfoDate("25/05/2025"), "");
});

test("imagem do portal e redimensionada; a de fora passa intacta", () => {
  // foto do jogador: quadrada e recortada, em 2x
  assert.equal(
    transferPhotoUrl("/api/uploads/rodrygo-abc.png", 64),
    "/api/uploads/rodrygo-abc.png?w=128&h=128&fit=cover&q=82",
  );
  // escudo NUNCA é recortado (cortaria o brasão)
  assert.equal(transferCrestUrl("/api/uploads/rm.png", 20), "/api/uploads/rm.png?w=40&q=82");
  assert.ok(!transferCrestUrl("/api/uploads/rm.png").includes("fit=cover"));
  // URL de fora (campo de reserva de quem não tem upload.images) não é tocada
  assert.equal(transferPhotoUrl("https://exemplo.com/foto.jpg"), "https://exemplo.com/foto.jpg");
  assert.equal(transferCrestUrl("https://exemplo.com/escudo.png"), "https://exemplo.com/escudo.png");
  assert.equal(transferPhotoUrl(""), "");
  assert.equal(transferCrestUrl(undefined), "");
});

test("toda posicao tem chave de i18n propria e unica", () => {
  const chaves = TRANSFER_POSITIONS.map(positionKey);
  assert.equal(new Set(chaves).size, TRANSFER_POSITIONS.length);
  assert.equal(positionKey("forward"), "transfers.pos.forward");
});
