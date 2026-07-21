import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedTarget,
  isPrivateOrReservedIp,
  SsrfError,
  type SsrfErrorCode,
} from "../src/lib/safeFetch.ts";

/**
 * PRD-06b — SSRF autenticado (article-from-url + scrape). O handler chama
 * `assertAllowedTarget(url, () => true, { allowHttp: false })` como portão
 * síncrono no topo, ANTES de qualquer request (Diffbot/oEmbed/scrape). Estes
 * testes cobrem esse guarda de forma determinística e SEM rede — nunca se
 * dispara exploit real contra pg-blogs/ollama/central/169.254.169.254.
 */

function expectSsrf(fn: () => void, code: SsrfErrorCode): void {
  assert.throws(
    fn,
    (e: unknown) => e instanceof SsrfError && e.code === code,
    `esperava SsrfError(${code})`,
  );
}

test("portão article-from-url: IP interno literal é bloqueado (ssrf_blocked)", () => {
  // alvos internos do AP-2 por IP literal, sobre https (o protocolo passa e o
  // bloqueio de IP dispara). Sobre http eles também são barrados, mas pelo
  // check de protocolo (ver teste seguinte).
  for (const u of [
    "https://169.254.169.254/latest/meta-data/", // metadados de nuvem
    "https://127.0.0.1/",
    "https://10.0.0.5/internal",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://[::1]/",
  ]) {
    expectSsrf(() => assertAllowedTarget(u, () => true, { allowHttp: false }), "ssrf_blocked");
  }
  // mesmo com allowHttp:true (canário desligado), o IP interno segue bloqueado
  expectSsrf(() => assertAllowedTarget("http://169.254.169.254/", () => true, { allowHttp: true }), "ssrf_blocked");
});

test("portão article-from-url: http (sem allowHttp) é bloqueado como protocolo", () => {
  // um host público por http ainda cai no protocolo (canário: allowHttp:false)
  expectSsrf(() => assertAllowedTarget("http://g1.globo.com/x", () => true, { allowHttp: false }), "protocol_not_allowed");
  expectSsrf(() => assertAllowedTarget("ftp://x/", () => true, { allowHttp: false }), "protocol_not_allowed");
  expectSsrf(() => assertAllowedTarget("file:///etc/passwd", () => true, { allowHttp: false }), "protocol_not_allowed");
});

test("portão article-from-url: fonte pública https legítima é aceita", () => {
  for (const u of [
    "https://g1.globo.com/politica/noticia/2026/07/21/exemplo.ghtml",
    "https://www.bbc.com/news/world-123",
    "https://ge.globo.com/futebol/",
  ]) {
    assert.doesNotThrow(() => assertAllowedTarget(u, () => true, { allowHttp: false }));
  }
});

test("classificador de IP: alvos internos reservados, hosts públicos liberados", () => {
  for (const ip of ["169.254.169.254", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "::1"]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1"]) {
    assert.equal(isPrivateOrReservedIp(ip), false, ip);
  }
});
