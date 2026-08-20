/**
 * Testes da separação buscador x rede social (P0 de indexação, F-26).
 * O caso que importa: buscador NÃO pode ser tratado como crawler social.
 * Rodar com: pnpm run test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSocialCrawler } from "./crawlerUa";

test("buscador NUNCA é crawler social (recebe o SSR completo)", () => {
  // U-1..U-3: os três que saíram do plugin em 20/08/2026.
  assert.equal(isSocialCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), false);
  assert.equal(isSocialCrawler("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"), false);
  assert.equal(isSocialCrawler("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)"), false);
  // Googlebot-Image/Video/News herdam o nome e portanto a mesma decisão.
  assert.equal(isSocialCrawler("Googlebot-Image/1.0"), false);
  assert.equal(isSocialCrawler("Mozilla/5.0 (compatible; Googlebot-News)"), false);
  // W3C_Validator é ferramenta de validação, não preview de compartilhamento.
  assert.equal(isSocialCrawler("W3C_Validator/1.3"), false);
});

test("crawler social continua recebendo o card de compartilhamento", () => {
  for (const ua of [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Twitterbot/1.0",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "Pinterest/0.2 (+http://www.pinterest.com/bot.html)",
    "vkShare; +http://vk.com/dev/Share",
  ]) {
    assert.equal(isSocialCrawler(ua), true, ua);
  }
});

test("navegador de gente nunca cai no stub", () => {
  assert.equal(isSocialCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"), false);
  assert.equal(isSocialCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), false);
});

test("U-8: Google-InspectionTool (o 'Testar URL ativa' do GSC) nao casa - por isso mascarava o defeito", () => {
  assert.equal(isSocialCrawler("Mozilla/5.0 (compatible; Google-InspectionTool/1.0)"), false);
});

test("U-9: UA vazio ou ausente nao e crawler social", () => {
  assert.equal(isSocialCrawler(""), false);
  assert.equal(isSocialCrawler(undefined), false);
  assert.equal(isSocialCrawler(null), false);
});

test("o navegador embutido do Instagram continua no stub (X-18, registrado como P2)", () => {
  // Um leitor humano nesse app cai no card e chega a materia pelo
  // location.replace do stub. Nao e P0 e nao se resolve aqui.
  assert.equal(isSocialCrawler("Mozilla/5.0 (iPhone) Instagram 302.0.0.23.113"), true);
});
