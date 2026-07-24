/**
 * internalTraffic — fonte única do conjunto de IPs internos (Configurações do painel).
 *
 * Extraído de routes/analytics.ts (PRD 04 RF3) para que as rotas de anúncio
 * (routes/ads.ts) usem EXATAMENTE a mesma decisão de tráfego interno do /event, sem
 * duplicar a leitura de settings nem a string da chave. Memoizado: o sync periódico
 * de settings muda a string e o Set é reconstruído sem restart.
 */
import { store } from "./store.js";
import { parseInternalIps, detectInternal, type InternalReason } from "./analyticsShared.js";

let _internalIpsRaw: string | undefined;
let _internalIpSet = new Set<string>();

export function internalIpSet(): Set<string> {
  const raw = store.getSettings().internalIps;
  if (raw !== _internalIpsRaw) {
    _internalIpsRaw = raw;
    _internalIpSet = new Set(parseInternalIps(raw));
  }
  return _internalIpSet;
}

/** Conveniência (PRD 03 RF4): decide interno + razão a partir da flag do body e do
 *  IP, usando o Set memoizado. Reusado por /event, /behavior e (PRD 04) rotas de ads. */
export function detectInternalRequest(
  bodyFlag: boolean, ip: string,
): { internal: boolean; reason: InternalReason | null } {
  return detectInternal(bodyFlag, ip, internalIpSet());
}
