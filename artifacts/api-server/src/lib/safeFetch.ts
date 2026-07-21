/**
 * safeFetch — fetch com defesa contra SSRF (PRD-06a).
 *
 * Fecha o vetor do attack path AP-2: um proxy/scraper que busca uma URL
 * pode ser induzido a alcançar serviços internos (169.254.169.254 metadados,
 * pg-blogs, ollama, central:8090) via IP privado direto OU via redirect de um
 * host allowlisted para um destino interno.
 *
 * Garantias:
 *   - bloqueio de IPs privados/reservados (literal E por resolução de DNS);
 *   - revalidação de host + IP em CADA hop de redirect (redirect: "manual");
 *   - https por padrão (http só com allowHttp explícito, restrito à allowlist);
 *   - limite de tempo (timeout) e de tamanho de corpo (maxBytes).
 *
 * Reutilizado pelo proxy de imagem (routes/image.ts) e, no PRD-06b, pelo
 * article-from-url/scrape. A allowlist de host é passada por parâmetro — este
 * módulo não conhece nada específico de imagem.
 *
 * Resíduo aceito (documentado): existe uma janela TOCTOU de DNS-rebinding entre
 * a resolução do DNS e o connect real. O bloqueio de redirect + a resolução de
 * DNS fecham o vetor prático do AP-2; o "pinning" ao IP validado no connect é
 * melhoria futura (exigiria dispatcher customizado do undici).
 */

import net from "node:net";
import { lookup } from "node:dns/promises";

export type SsrfErrorCode =
  | "ssrf_blocked"
  | "host_not_allowed"
  | "protocol_not_allowed"
  | "too_many_redirects"
  | "response_too_large";

export class SsrfError extends Error {
  code: SsrfErrorCode;
  constructor(code: SsrfErrorCode, message: string) {
    super(message);
    this.name = "SsrfError";
    this.code = code;
  }
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isReservedIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const o = parts.map((p) => parseInt(p, 10));
  if (o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (o[0] === 255 && o[1] === 255 && o[2] === 255 && o[3] === 255) return true; // broadcast
  return false;
}

/** Extrai o IPv4 embutido num endereço IPv4-mapped (::ffff:a.b.c.d ou ::ffff:aabb:ccdd). */
function extractMappedIPv4(addr: string): string | null {
  const dotted = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1] ?? null;
  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1] ?? "0", 16);
    const lo = parseInt(hex[2] ?? "0", 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

function ipv6FirstGroup(addr: string): number {
  if (addr.startsWith("::")) return 0;
  const first = addr.split(":")[0] ?? "0";
  const n = parseInt(first, 16);
  return Number.isNaN(n) ? 0 : n;
}

function isReservedIPv6(addr: string): boolean {
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  const g0 = ipv6FirstGroup(addr);
  const high = (g0 >> 8) & 0xff;
  if (high === 0xfc || high === 0xfd) return true; // fc00::/7 unique-local
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true; // fe80::/10 link-local
  return false;
}

/**
 * `true` para IPs de faixas privadas/reservadas/loopback/link-local/metadata
 * (IPv4, IPv6 e IPv4-mapped). Função pura, sem rede — testável isoladamente.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = stripBrackets(ip).trim().toLowerCase();
  const ver = net.isIP(clean);
  if (ver === 4) return isReservedIPv4(clean);
  if (ver === 6) {
    const mapped = extractMappedIPv4(clean);
    if (mapped) return isReservedIPv4(mapped);
    return isReservedIPv6(clean);
  }
  return false; // não é um IP literal — não é responsabilidade desta função
}

export interface AllowTargetOpts {
  allowHttp?: boolean;
}

/**
 * Valida SINCRONAMENTE (sem rede) uma URL alvo: protocolo permitido, host na
 * allowlist e — se o host for um literal de IP — que não seja privado/reservado.
 * Lança `SsrfError` com `code` estável em qualquer falha.
 */
export function assertAllowedTarget(
  rawUrl: string,
  isAllowedHost: (hostname: string) => boolean,
  opts: AllowTargetOpts = {},
): void {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError("protocol_not_allowed", "URL inválida");
  }
  const proto = u.protocol;
  const httpOk = proto === "http:" && opts.allowHttp === true;
  if (proto !== "https:" && !httpOk) {
    throw new SsrfError("protocol_not_allowed", `protocolo não permitido: ${proto}`);
  }
  const host = stripBrackets(u.hostname);
  if (!isAllowedHost(host)) {
    throw new SsrfError("host_not_allowed", `host não permitido: ${host}`);
  }
  if (net.isIP(host) !== 0 && isPrivateOrReservedIp(host)) {
    throw new SsrfError("ssrf_blocked", `IP privado/reservado bloqueado: ${host}`);
  }
}

/** Resolve o DNS do host e lança se QUALQUER endereço for privado/reservado. */
async function assertResolvedIpsSafe(rawUrl: string): Promise<void> {
  const host = stripBrackets(new URL(rawUrl).hostname);
  if (net.isIP(host) !== 0) return; // literal já validado por assertAllowedTarget
  let results: Array<{ address: string }>;
  try {
    results = await lookup(host, { all: true });
  } catch {
    // DNS não resolveu — deixa o fetch falhar naturalmente (não é bypass de SSRF)
    return;
  }
  for (const r of results) {
    if (isPrivateOrReservedIp(r.address)) {
      throw new SsrfError(
        "ssrf_blocked",
        `DNS de ${host} resolve para IP privado/reservado ${r.address}`,
      );
    }
  }
}

async function readWithLimit(resp: Response, maxBytes: number): Promise<Buffer> {
  if (!resp.body) {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new SsrfError("response_too_large", `resposta excede ${maxBytes} bytes`);
    }
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SsrfError("response_too_large", `resposta excede ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

export interface SafeFetchInit {
  isAllowedHost: (hostname: string) => boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  allowHttp?: boolean;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: Buffer;
}

/**
 * Fetch seguro: valida o alvo (protocolo/host/IP), resolve o DNS bloqueando IP
 * interno, segue redirects MANUALMENTE revalidando cada hop, e impõe timeout +
 * limite de tamanho. Retorna a resposta terminal com o corpo já lido em Buffer.
 */
export async function safeFetch(url: string, init: SafeFetchInit): Promise<SafeFetchResult> {
  const {
    isAllowedHost,
    headers,
    timeoutMs = 6_000,
    maxBytes = 10 * 1024 * 1024,
    allowHttp = false,
    maxRedirects = 3,
  } = init;

  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;

  for (let hop = 0; ; hop++) {
    assertAllowedTarget(current, isAllowedHost, { allowHttp });
    await assertResolvedIpsSafe(current);

    const resp = await fetch(current, { headers, signal, redirect: "manual" });

    const isRedirect = resp.status >= 300 && resp.status < 400 && resp.headers.has("location");
    if (isRedirect) {
      await resp.body?.cancel().catch(() => undefined);
      if (hop >= maxRedirects) {
        throw new SsrfError("too_many_redirects", `excedeu ${maxRedirects} redirects`);
      }
      const location = resp.headers.get("location") ?? "";
      current = new URL(location, current).toString();
      continue; // revalida o próximo hop no topo do loop
    }

    const body = await readWithLimit(resp, maxBytes);
    return { status: resp.status, headers: resp.headers, body };
  }
}
