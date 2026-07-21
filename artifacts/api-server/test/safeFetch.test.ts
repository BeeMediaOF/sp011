import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPrivateOrReservedIp,
  assertAllowedTarget,
  SsrfError,
  type SsrfErrorCode,
} from "../src/lib/safeFetch.ts";

function expectSsrf(fn: () => void, code: SsrfErrorCode): void {
  assert.throws(
    fn,
    (e: unknown) => e instanceof SsrfError && e.code === code,
    `esperava SsrfError(${code})`,
  );
}

test("isPrivateOrReservedIp: bloqueia faixas privadas/reservadas (IPv4/IPv6/mapped)", () => {
  const reserved = [
    "169.254.169.254", // link-local / metadados de nuvem
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "100.64.0.1", "0.0.0.0", "255.255.255.255",
    "::1", "fc00::1", "fd12:3456::1", "fe80::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", // IPv4-mapped (dotted e hex)
  ];
  for (const ip of reserved) {
    assert.equal(isPrivateOrReservedIp(ip), true, `deveria ser reservado: ${ip}`);
  }
});

test("isPrivateOrReservedIp: libera IPs públicos", () => {
  const publics = [
    "93.184.216.34", "8.8.8.8", "1.1.1.1",
    "172.32.0.1", "192.169.0.1", "100.63.255.255", "100.128.0.1",
    "2606:2800:220:1:248:1893:25c8:1946", "2001:4860:4860::8888",
    "::ffff:93.184.216.34",
  ];
  for (const ip of publics) {
    assert.equal(isPrivateOrReservedIp(ip), false, `deveria ser público: ${ip}`);
  }
});

test("assertAllowedTarget: rejeita IP privado literal (ssrf_blocked)", () => {
  expectSsrf(() => assertAllowedTarget("https://169.254.169.254/latest/meta-data/", () => true), "ssrf_blocked");
  expectSsrf(() => assertAllowedTarget("https://127.0.0.1/", () => true), "ssrf_blocked");
  expectSsrf(() => assertAllowedTarget("https://[::1]/", () => true), "ssrf_blocked");
});

test("assertAllowedTarget: rejeita host fora da allowlist (host_not_allowed)", () => {
  expectSsrf(() => assertAllowedTarget("https://evil.example.com/x", () => false), "host_not_allowed");
});

test("assertAllowedTarget: rejeita protocolo não-http(s) (protocol_not_allowed)", () => {
  expectSsrf(() => assertAllowedTarget("ftp://x/", () => true), "protocol_not_allowed");
  expectSsrf(() => assertAllowedTarget("file:///etc/passwd", () => true), "protocol_not_allowed");
});

test("assertAllowedTarget: rejeita http quando allowHttp=false (padrão)", () => {
  expectSsrf(() => assertAllowedTarget("http://images.metroimg.com/x.jpg", () => true), "protocol_not_allowed");
});

test("assertAllowedTarget: aceita https de host allowlisted", () => {
  assert.doesNotThrow(() => assertAllowedTarget("https://images.metroimg.com/x.jpg", () => true));
});

test("assertAllowedTarget: aceita http só quando allowHttp=true e host permitido", () => {
  assert.doesNotThrow(() => assertAllowedTarget("http://images.metroimg.com/x.jpg", () => true, { allowHttp: true }));
  // mas IP interno continua bloqueado mesmo com allowHttp=true
  expectSsrf(() => assertAllowedTarget("http://169.254.169.254/", () => true, { allowHttp: true }), "ssrf_blocked");
});

test("revalidação de hop: um Location apontando para IP interno é rejeitado", () => {
  // safeFetch chama assertAllowedTarget em CADA hop de redirect; um destino
  // interno (ex.: 302 -> http://169.254.169.254/) é barrado antes de ser seguido.
  expectSsrf(() => assertAllowedTarget("https://169.254.169.254/", () => true), "ssrf_blocked");
  expectSsrf(() => assertAllowedTarget("https://10.0.0.5/internal", () => true), "ssrf_blocked");
});
