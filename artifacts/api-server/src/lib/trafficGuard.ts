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

export function isBotRequest(req: Request): boolean {
  const ua = String(req.headers["user-agent"] ?? "");
  return ua.length === 0 || BOT_RE.test(ua);
}

interface HitWindow { count: number; resetAt: number }

const _hits = new Map<string, HitWindow>();

const _sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of _hits) {
    if (w.resetAt < now) _hits.delete(key);
  }
}, 5 * 60_000);
if (typeof _sweeper.unref === "function") _sweeper.unref();

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
