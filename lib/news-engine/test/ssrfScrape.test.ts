import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedTarget,
  isPrivateOrReservedIp,
  SsrfError,
  type SsrfErrorCode,
} from "../src/safeFetch.ts";

/**
 * PRD-06b — SSRF na coleta (scrapeArticle do news-engine). O espelho
 * `src/safeFetch.ts` deve ter a MESMA semântica do util do api-server. Testes
 * determinísticos, sem rede (classificador de IP + assertAllowedTarget).
 */

function expectSsrf(fn: () => void, code: SsrfErrorCode): void {
  assert.throws(
    fn,
    (e: unknown) => e instanceof SsrfError && e.code === code,
    `esperava SsrfError(${code})`,
  );
}

test("espelho: IP privado/reservado literal é bloqueado", () => {
  for (const ip of [
    "169.254.169.254", "127.0.0.1", "10.1.2.3", "172.16.0.1",
    "172.31.255.255", "192.168.0.1", "100.64.0.1", "0.0.0.0",
    "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("espelho: IP público é liberado", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2001:4860:4860::8888"]) {
    assert.equal(isPrivateOrReservedIp(ip), false, ip);
  }
});

test("espelho: assertAllowedTarget barra IP interno (https), http e protocolos estranhos", () => {
  // IP interno sobre https → cai no bloqueio de IP (protocolo passa antes)
  expectSsrf(() => assertAllowedTarget("https://169.254.169.254/", () => true, { allowHttp: false }), "ssrf_blocked");
  expectSsrf(() => assertAllowedTarget("https://10.0.0.5/", () => true, { allowHttp: false }), "ssrf_blocked");
  // http é barrado pelo protocolo (canário allowHttp:false), antes do check de IP
  expectSsrf(() => assertAllowedTarget("http://exemplo.com/", () => true, { allowHttp: false }), "protocol_not_allowed");
  expectSsrf(() => assertAllowedTarget("file:///etc/passwd", () => true, { allowHttp: false }), "protocol_not_allowed");
  // mesmo com allowHttp:true, IP interno continua bloqueado
  expectSsrf(() => assertAllowedTarget("http://169.254.169.254/", () => true, { allowHttp: true }), "ssrf_blocked");
});

test("espelho: fonte pública https é aceita", () => {
  assert.doesNotThrow(() => assertAllowedTarget("https://ge.globo.com/futebol/", () => true, { allowHttp: false }));
});
