/**
 * Coletor central — porte da lógica do `scheduler.ts` + `processDueSource`
 * do blog: tick de 1 min, ciclo quando o intervalo venceu e está dentro da
 * janela (horário de Brasília), orçamento por ciclo/dia, backpressure pela
 * fila de reescrita, fontes "devidas" por scheduleHours.
 *
 * Diferença estrutural: aqui a coleta grava `news_items` (status "queued")
 * no banco central — nada de artigos/blogs neste estágio.
 */
import { randomUUID } from "node:crypto";
import {
  db,
  centralSourcesTable,
  newsItemsTable,
  type CentralSourceRow,
} from "@workspace/central-db";
import { fetchSourceArticles, normalizeTitle, type EngineSource } from "@workspace/news-engine";
import { count, eq, gte, and } from "drizzle-orm";
import { getSettings } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import { isDuplicateNews, makeNewsDedupChecker } from "../lib/newsDedup.js";
import { dailyQuotaFilledReason } from "../lib/dailyQuota.js";

const TICK_MS = 60_000;

let _timer: NodeJS.Timeout | null = null;
let _lastCycleAt = 0;
let _cycleRunning = false;

// ─── Janela de coleta (horário de Brasília, UTC-3 fixo desde 2019) ───────────

function nowInBrasilia(): { day: number; hour: number } {
  const br = new Date(Date.now() - 3 * 3600_000);
  return { day: br.getUTCDay(), hour: br.getUTCHours() };
}

export function isInCollectionWindow(): boolean {
  const s = getSettings();
  const { day, hour } = nowInBrasilia();
  if (s.collectionDays && s.collectionDays.length > 0 && !s.collectionDays.includes(day)) {
    return false;
  }
  const start = s.collectionStartHour;
  const end = s.collectionEndHour;
  if (start == null || end == null || start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // janela cruzando a meia-noite
}

// ─── Fontes devidas ───────────────────────────────────────────────────────────

function isDue(src: CentralSourceRow): boolean {
  if (!src.active || src.scheduleHours <= 0) return false;
  const last = src.lastFetchedAt?.getTime() ?? 0;
  return Date.now() - last >= src.scheduleHours * 3600_000;
}

function toEngineSource(src: CentralSourceRow): EngineSource {
  return {
    id: src.id,
    name: src.name,
    url: src.url,
    category: src.category,
    fetchLimit: src.fetchLimit,
    giveCredit: src.giveCredit,
    customPrompt: src.customPrompt,
  };
}

// ─── Orçamento ────────────────────────────────────────────────────────────────

async function countPendingRewrites(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(newsItemsTable)
    .where(eq(newsItemsTable.status, "queued"));
  return row?.n ?? 0;
}

async function countCollectedToday(): Promise<number> {
  // Meia-noite de Brasília convertida para UTC
  const nowBr = new Date(Date.now() - 3 * 3600_000);
  const midnightBrUtc = new Date(Date.UTC(
    nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate(), 3, 0, 0,
  ));
  const [row] = await db
    .select({ n: count() })
    .from(newsItemsTable)
    .where(gte(newsItemsTable.createdAt, midnightBrUtc));
  return row?.n ?? 0;
}

// ─── Coleta de uma fonte ──────────────────────────────────────────────────────

/**
 * Coleta uma fonte agora, respeitando um teto opcional de itens.
 * Retorna quantas notícias novas entraram na fila.
 */
/** Profundidade da varredura do feed atrás de itens NOVOS (dedup pré-scrape). */
const FEED_SCAN_LIMIT = 25;

/**
 * Texto da fonte abaixo disto costuma ser scrape incompleto (só o excerpt de
 * ~300 chars do feed): reescrever geraria matéria "incompleta" no blog. O
 * item fica registrado (status collected/short_content — segura o dedup) mas
 * não entra na fila de reescrita.
 */
const MIN_SOURCE_CONTENT_CHARS = 400;

/**
 * Sonda rápida da imagem da notícia: URL morta/bloqueada não entra no item
 * (o blog publicaria card com imagem quebrada). HEAD com fallback para GET
 * de 1 byte (CDNs que rejeitam HEAD); erro/timeout → imagem descartada.
 */
async function imageUrlAlive(url: string): Promise<boolean> {
  const okResponse = (r: Response): boolean => {
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") ?? "";
    return ct === "" || ct.startsWith("image/") || ct === "application/octet-stream";
  };
  try {
    const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    if (okResponse(head)) return true;
    if (head.status !== 405 && head.status !== 403 && head.status !== 501) return false;
  } catch { /* tenta GET */ }
  try {
    const get = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(5_000),
    });
    return okResponse(get) || get.status === 206;
  } catch {
    return false;
  }
}

/**
 * Fallback de imagem: feed sem imagem (ou com imagem morta) → busca o
 * og:image/twitter:image na página original da matéria. Evita card cinza
 * "sem imagem" no blog. Melhor esforço: erro/timeout → segue sem imagem.
 */
async function fetchOgImage(pageUrl: string, userAgent?: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: userAgent ? { "User-Agent": userAgent } : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.includes("html")) return null;
    // O og:image fica no <head> — 200KB cobrem qualquer página real.
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const found = m?.[1]?.trim();
    if (!found || !/^https?:\/\//i.test(found)) return null;
    return found;
  } catch {
    return null;
  }
}

export async function collectSource(src: CentralSourceRow, maxItems?: number): Promise<number> {
  const s = getSettings();
  const cap = maxItems ?? Number.POSITIVE_INFINITY;
  let collected = 0;

  try {
    // Dedup ANTES do scrape: o fetch_limit passa a valer para itens NOVOS.
    // Sem isso, fonte com fetch_limit=1 e feed de ritmo lento (futebol
    // americano, e-sports, vôlei) ficava presa no item do topo já coletado
    // e rendia zero por ciclo.
    const probeKnown = await makeNewsDedupChecker();
    const articles = await fetchSourceArticles(toEngineSource(src), {
      defaultFetchLimit: s.collectionDefaultFetchLimit,
      userAgent: s.userAgent,
      scanLimit: FEED_SCAN_LIMIT,
      isKnown: probeKnown,
    });

    for (const art of articles) {
      if (collected >= cap) break;
      if (!art.title || art.title === "Sem título") continue;

      if (await isDuplicateNews({ title: art.title, guid: art.guid, url: art.link })) {
        logEvent({
          module: "collector", level: "info", refType: "source", refId: src.id,
          message: `Duplicada, ignorada: ${art.title}`,
        });
        continue;
      }

      const text = art.fullText?.trim() ?? "";
      const hasText = text.length > 0;
      // Só texto "inteiro" vai para a reescrita — curto demais é matéria capada.
      const usableText = text.length >= MIN_SOURCE_CONTENT_CHARS;
      let imageUrl = art.imageUrl || null;
      if (imageUrl && !(await imageUrlAlive(imageUrl))) {
        logEvent({
          module: "collector", level: "warn", refType: "source", refId: src.id,
          message: `Imagem inacessível, removida da notícia: ${art.title} (${imageUrl})`,
        });
        imageUrl = null;
      }
      // Sem imagem do feed → tenta o og:image da página original
      if (!imageUrl && art.link) {
        const og = await fetchOgImage(art.link, s.userAgent);
        if (og && (await imageUrlAlive(og))) {
          imageUrl = og;
          logEvent({
            module: "collector", refType: "source", refId: src.id,
            message: `Imagem recuperada via og:image: ${art.title}`,
          });
        }
      }
      if (!hasText && !imageUrl) {
        logEvent({
          module: "collector", level: "warn", refType: "source", refId: src.id,
          message: `Sem conteúdo nem imagem, descartada: ${art.title}`,
        });
        continue;
      }
      if (hasText && !usableText) {
        logEvent({
          module: "collector", level: "warn", refType: "source", refId: src.id,
          message: `Texto curto demais (${text.length} chars, mínimo ${MIN_SOURCE_CONTENT_CHARS}) — não vai para reescrita: ${art.title}`,
        });
      }

      const id = randomUUID();
      await db.insert(newsItemsTable).values({
        id,
        sourceId: src.id,
        sourceName: src.name,
        guid: art.guid ?? null,
        originalUrl: art.link || null,
        title: art.title,
        titleNorm: normalizeTitle(art.title),
        description: art.excerpt || null,
        contentRaw: art.fullText || null,
        imageUrl,
        category: src.category,
        publishedAtSource: art.pubDate ? new Date(art.pubDate) : null,
        // Sem texto (ou texto capado) não há o que reescrever — fica só coletado.
        status: usableText ? "queued" : "collected",
        failReason: usableText ? null : (hasText ? "short_content" : "no_content"),
      });
      collected++;

      logEvent({
        module: "collector", refType: "news_item", refId: id,
        message: `Coletada de ${src.name}: ${art.title}`,
      });
    }
  } catch (err) {
    logger.warn({ err, sourceId: src.id }, "Falha ao coletar fonte");
    logEvent({
      module: "collector", level: "error", refType: "source", refId: src.id,
      message: `Falha na coleta de ${src.name}: ${String(err)}`,
    });
  }

  try {
    await db
      .update(centralSourcesTable)
      .set({ lastFetchedAt: new Date() })
      .where(eq(centralSourcesTable.id, src.id));
  } catch (err) {
    logger.warn({ err, sourceId: src.id }, "Falha ao atualizar lastFetchedAt");
  }

  return collected;
}

/** Coleta manual de uma fonte por id (rota POST /sources/:id/run). */
export async function collectSourceById(id: string): Promise<number> {
  const rows = await db
    .select()
    .from(centralSourcesTable)
    .where(eq(centralSourcesTable.id, id))
    .limit(1);
  const src = rows[0];
  if (!src) throw new Error("Fonte não encontrada");
  return collectSource(src);
}

// ─── Ciclo ────────────────────────────────────────────────────────────────────

export async function runCollectorCycle(force = false): Promise<{ collected: number; skipped?: string }> {
  const s = getSettings();
  if (!force) {
    if (!s.collectionEnabled) return { collected: 0, skipped: "coleta desabilitada" };
    if (!isInCollectionWindow()) return { collected: 0, skipped: "fora da janela de coleta" };
  }

  const pending = await countPendingRewrites();
  if (pending >= s.maxPendingRewrites) {
    return { collected: 0, skipped: `backpressure: ${pending} reescritas pendentes` };
  }

  // Fila do dia cheia em todos os blogs → coletar agora só geraria entrega
  // para amanhã (gasto de scraping/IA à toa). Coleta manual (force) ignora.
  if (!force) {
    const quotaReason = await dailyQuotaFilledReason();
    if (quotaReason) return { collected: 0, skipped: quotaReason };
  }

  let budget = s.collectionMaxPerCycle ?? Number.POSITIVE_INFINITY;
  if (s.collectionMaxPerDay) {
    const usedToday = await countCollectedToday();
    budget = Math.min(budget, Math.max(0, s.collectionMaxPerDay - usedToday));
  }
  if (budget <= 0) return { collected: 0, skipped: "orçamento diário esgotado" };

  const sources = await db
    .select()
    .from(centralSourcesTable)
    .where(and(eq(centralSourcesTable.active, true)));
  // Fonte há mais tempo sem coleta vai primeiro: com orçamento apertado, a
  // ordem arbitrária do SELECT deixava sempre as mesmas fontes de fora.
  const due = sources
    .filter(isDue)
    .sort((a, b) => (a.lastFetchedAt?.getTime() ?? 0) - (b.lastFetchedAt?.getTime() ?? 0));

  let total = 0;
  for (const src of due) {
    if (budget <= 0) break;
    const n = await collectSource(src, budget);
    total += n;
    budget -= n;
  }

  if (due.length > 0) {
    logger.info({ dueSources: due.length, collected: total }, "Ciclo de coleta concluído");
  }
  return { collected: total };
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (_cycleRunning) return;
  const s = getSettings();
  const intervalMs = Math.max(5, s.collectionIntervalMinutes) * 60_000;
  if (Date.now() - _lastCycleAt < intervalMs) return;
  if (!s.collectionEnabled || !isInCollectionWindow()) return;

  _cycleRunning = true;
  _lastCycleAt = Date.now();
  try {
    await runCollectorCycle();
  } catch (err) {
    logger.error({ err }, "Erro no ciclo do coletor");
  } finally {
    _cycleRunning = false;
  }
}

export function startCollector(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, TICK_MS);
  _timer.unref();
  logger.info("Coletor central iniciado (tick 60s)");
}
