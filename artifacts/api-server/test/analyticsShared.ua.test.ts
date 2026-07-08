import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUa, detectDevice } from "../src/lib/analyticsShared.ts";
import { isBotRequest } from "../src/lib/trafficGuard.ts";

const UA = {
  chromeWin:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edgeWin:    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87",
  firefoxLin: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  safariMac:  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  chromeIos:  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  samsung:    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  cubot:      "Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36",
  ipad:       "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
};

test("parseUa: famílias de navegador (ordem importa — Edge/Samsung embutem Chrome)", () => {
  assert.deepEqual(parseUa(UA.chromeWin),  { browser: "chrome",  os: "windows" });
  assert.deepEqual(parseUa(UA.edgeWin),    { browser: "edge",    os: "windows" });
  assert.deepEqual(parseUa(UA.firefoxLin), { browser: "firefox", os: "linux" });
  assert.deepEqual(parseUa(UA.safariMac),  { browser: "safari",  os: "macos" });
  assert.deepEqual(parseUa(UA.chromeIos),  { browser: "chrome",  os: "ios" });
  assert.deepEqual(parseUa(UA.samsung),    { browser: "samsung", os: "android" });
});

test("parseUa: fora do catálogo vira 'outro' — nunca inventa valor", () => {
  assert.deepEqual(parseUa(""), { browser: "outro", os: "outro" });
  assert.equal(parseUa("AparelhoMisterioso/1.0").browser, "outro");
});

test("detectDevice: mobile/tablet/desktop consistente", () => {
  assert.equal(detectDevice(UA.chromeWin), "desktop");
  assert.equal(detectDevice(UA.chromeIos), "mobile");
  assert.equal(detectDevice(UA.ipad), "tablet");
});

function fakeReq(ua: string) {
  return { headers: { "user-agent": ua } } as unknown as Parameters<typeof isBotRequest>[0];
}

test("isBotRequest: bots/CLIs e UA vazio filtrados; celular CUBOT NÃO é bot", () => {
  assert.equal(isBotRequest(fakeReq("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")), true);
  assert.equal(isBotRequest(fakeReq("curl/8.4.0")), true);
  assert.equal(isBotRequest(fakeReq("python-requests/2.31")), true);
  assert.equal(isBotRequest(fakeReq("")), true);
  assert.equal(isBotRequest(fakeReq(UA.cubot)), false);
  assert.equal(isBotRequest(fakeReq(UA.chromeWin)), false);
});
