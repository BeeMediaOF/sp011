/**
 * trafficGuard — proteção leve para endpoints públicos de métricas
 * (analytics, impressões/cliques de anúncio).
 *
 * Dois filtros, ambos de descarte SILENCIOSO (o chamador responde ok:true
 * sem registrar nada — não recompensa quem está sondando o endpoint):
 *  - isBotRequest: user-agents de crawlers/CLIs conhecidos ou vazios.
 *  - overRateLimit: janela de 1 minuto por chave, em memória (sem custo de DB;
 *    o objetivo é impedir inflação grosseira de métricas, não segurança).
 */
import type { Request } from "express";

// Tokens específicos (evita "bot" genérico, que casaria com celulares CUBOT etc.)
const BOT_RE =
  /googlebot|bingbot|yandex|baidu|duckduckbot|applebot|petalbot|slurp|crawler|spider|crawling|scrapy|curl\/|wget\/|python|httpclient|okhttp|axios\/|go-http|libwww|phantomjs|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|semrush|ahrefs|mj12bot|dotbot|facebookexternalhit/i;

/** Decisão de bot a partir do user-agent cru (sem o objeto Request) — fonte única
 *  usada por isBotRequest e pelos handlers extraídos (PRD 12 RF2/ingestHandlers). */
export function isBotUa(ua: string): boolean {
  return ua.length === 0 || BOT_RE.test(ua);
}

export function isBotRequest(req: Request): boolean {
  return isBotUa(String(req.headers["user-agent"] ?? ""));
}

/** Tetos por IP por minuto, por endpoint de ingest (PRD 03 RF7 — fonte única).
 *  Fail-open: as janelas em memória zeram no restart (nunca bloqueiam tráfego
 *  legítimo por estado perdido). Revisão PRD 03 (2026-07): valores MANTIDOS. */
export const INGEST_RATE_LIMITS = {
  event: 120, behavior: 30, adImpression: 60, adClick: 30,
} as const;

interface HitWindow { count: number; resetAt: number }

const _hits = new Map<string, HitWindow>();
const _lastSeen = new Map<string, number>();

const _sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of _hits) {
    if (w.resetAt < now) _hits.delete(key);
  }
  for (const [key, ts] of _lastSeen) {
    if (now - ts > 60_000) _lastSeen.delete(key);
  }
}, 5 * 60_000);
if (typeof _sweeper.unref === "function") _sweeper.unref();

/**
 * Dedup de repetição imediata (ex.: F5 em sequência): true quando a MESMA chave
 * (ex.: `"pv:<sessão>|<path>"`) foi vista há menos de `windowMs`. Janela
 * deslizante: refresh contínuo permanece dedupado até parar por `windowMs`.
 */
export function isRecentDuplicate(key: string, windowMs: number): boolean {
  const now = Date.now();
  const prev = _lastSeen.get(key);
  _lastSeen.set(key, now);
  return prev !== undefined && now - prev < windowMs;
}

/** True quando a chave (ex.: `"ev:1.2.3.4"`) excedeu `maxPerMinute` na janela atual. */
export function overRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const w = _hits.get(key);
  if (!w || w.resetAt < now) {
    _hits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  w.count++;
  return w.count > maxPerMinute;
}

// ─── Dedup genérico com retenção configurável (PRD 03 RF5) ────────────────────
// `isRecentDuplicate` acima serve só janelas curtas (o sweeper de _lastSeen limpa
// >60s). Este helper serve janelas longas (ex.: impressão de anúncio 30min do PRD 04)
// com teto de memória e varredura própria. Relógio injetável para os testes.
export interface DedupWindowOpts {
  windowMs: number;
  maxKeys?: number;          // default 50_000; excedeu → descarta a mais antiga
  sliding?: boolean;         // false (default): janela fixa a partir do 1º hit; true: cada hit renova
  now?: () => number;
}
export interface DedupWindow {
  /** true = chave já vista dentro da janela (duplicata); false = primeira vez. */
  hit(key: string): boolean;
  size(): number;
}

export function createDedupWindow(opts: DedupWindowOpts): DedupWindow {
  const { windowMs } = opts;
  const maxKeys = opts.maxKeys ?? 50_000;
  const sliding = opts.sliding ?? false;
  const now = opts.now ?? Date.now;
  const m = new Map<string, number>(); // chave -> expiraMs

  const sweeper = setInterval(() => {
    const t = now();
    for (const [k, exp] of m) if (exp <= t) m.delete(k);
  }, Math.max(30_000, Math.min(windowMs, 5 * 60_000)));
  if (typeof sweeper.unref === "function") sweeper.unref();

  return {
    hit(key: string): boolean {
      const t = now();
      const exp = m.get(key);
      if (exp !== undefined && exp > t) {
        if (sliding) { m.delete(key); m.set(key, t + windowMs); } // renova a janela
        return true;
      }
      m.delete(key);
      m.set(key, t + windowMs); // (re)insere no fim: ordem por recência para o eviction
      if (m.size > maxKeys) {
        const oldest = m.keys().next().value;
        if (oldest !== undefined) m.delete(oldest);
      }
      return false;
    },
    size(): number { return m.size; },
  };
}
