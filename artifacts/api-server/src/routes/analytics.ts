import { Router } from "express";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, analyticsEventsTable, geoStatsTable, adsTable, adDailyStatsTable, behaviorEventsTable, settingsTable } from "@workspace/db";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission } from "../middlewares/permissions.js";
import { store } from "../lib/store.js";
import { articleService } from "../lib/articleService.js";
import { logger } from "../lib/logger.js";
import { isBotRequest, overRateLimit, isRecentDuplicate, INGEST_RATE_LIMITS } from "../lib/trafficGuard.js";
import {
  DAY, brtDayKey, brtDayStartMs,
  VALID_TYPES, BEHAVIOR_TYPES, SCROLL_MILESTONES, MAX_READ_SECONDS,
  cleanStr, normalizeIp, isPrivateIp, planRequeue, capExcess,
  detectDevice, parseUa, classifyChannel,
  resolvePeriod, buildWindowAggregates, pctChange,
  compareTopCategories, dowOccurrences, pickPeakDow, buildBehaviorStats,
  clampIntParam, DASHBOARD_API_CONTRACT_VERSION,
  ANALYTICS_V2_SINCE, PAID_RULE_SINCE, type EventLike, type PaidCampaign,
} from "../lib/analyticsShared.js";
import { bumpHealth, bumpEndpoint, bumpInternalReason, noteEvent, noteFlush, healthSnapshot } from "../lib/analyticsHealth.js";
import {
  evaluateHealthAlerts, AD_SANITY_MARGIN,
  type HealthAlertInput, type HealthAlertDto, type SkippedRule,
} from "../lib/healthAlerts.js";
import { StatsResponseCache, STATS_CACHE_TTL_MS } from "../lib/statsCache.js";
import { detectInternalRequest } from "../lib/internalTraffic.js";
import { getSanityReport } from "../lib/sanityMonitor.js";

const router = Router();

export interface AnalyticsEvent {
  type: "pageview" | "read" | "category" | "scroll" | "share";
  path: string;
  title?: string;
  category?: string;
  articleId?: string;
  sessionId: string;
  duration?: number;
  device: "mobile" | "desktop" | "tablet";
  ts: number;
  ua?: string;
  referrer?: string;
  scrollDepth?: number;
  platform?: string;
  city?: string;
  region?: string;
  visitorId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refHost?: string;
  /** Presença de click-id na linha first-touch (PRD 05); undefined = não first-touch. */
  gclid?: boolean;
  fbclid?: boolean;
  isInternal?: boolean;
  browser?: string;
  os?: string;
  /** IP normalizado, transiente (nunca vai para o banco) — permite retro-preencher
   *  a geo de eventos ainda no buffer quando o lookup assíncrono resolve. */
  _ip?: string;
}

// ─── In-memory buffer ─────────────────────────────────────────────────────────
const BUFFER_MAX = 500;
let _buffer: AnalyticsEvent[] = [];
let _flushing = false;

// Cache de curta duração da resposta de /stats (PRD 09 RF2). 1 slot por processo
// = por container = por blog; efêmero (zera no restart). Chave inclui o período E
// o topArticlesLimit para nunca servir um recorte diferente do pedido.
const STATS_CACHE = new StatsResponseCache<Record<string, unknown>>(STATS_CACHE_TTL_MS);

function toRow(ev: AnalyticsEvent) {
  return {
    type:        ev.type,
    path:        ev.path,
    title:       ev.title ?? null,
    category:    ev.category ?? null,
    articleId:   ev.articleId ?? null,
    sessionId:   ev.sessionId,
    duration:    ev.duration ?? null,
    device:      ev.device,
    ts:          new Date(ev.ts),
    ua:          ev.ua ?? null,
    referrer:    ev.referrer ?? null,
    scrollDepth: ev.scrollDepth ?? null,
    platform:    ev.platform ?? null,
    city:        ev.city ?? null,
    region:      ev.region ?? null,
    visitorId:   ev.visitorId ?? null,
    utmSource:   ev.utmSource ?? null,
    utmMedium:   ev.utmMedium ?? null,
    utmCampaign: ev.utmCampaign ?? null,
    refHost:     ev.refHost ?? null,
    gclid:       ev.gclid ?? null,
    fbclid:      ev.fbclid ?? null,
    isInternal:  ev.isInternal ?? false,
    browser:     ev.browser ?? null,
    os:          ev.os ?? null,
  };
}

async function flushBuffer(): Promise<void> {
  if (_flushing || _buffer.length === 0) return;
  _flushing = true;
  const batch = _buffer.splice(0, _buffer.length);
  try {
    await db.insert(analyticsEventsTable).values(batch.map(toRow));
    noteFlush(true, batch.length);
  } catch {
    // Lote falhou. Tenta um a um: um evento inválido é descartado sozinho em vez
    // de envenenar o buffer para sempre; se NENHUM entrar (banco fora do ar),
    // re-enfileira para tentar no próximo ciclo.
    let ok = 0;
    let consecutiveFails = 0;
    const failed: AnalyticsEvent[] = [];
    for (const ev of batch) {
      if (ok === 0 && consecutiveFails >= 10) { failed.push(ev); continue; } // banco fora — para de insistir
      try {
        await db.insert(analyticsEventsTable).values(toRow(ev));
        ok++;
      } catch {
        consecutiveFails++;
        failed.push(ev);
      }
    }
    if (ok > 0) noteFlush(true, ok);
    if (ok === 0 && failed.length > 0) {
      // Banco fora: recoloca o que couber no buffer; o excedente é CONTADO como
      // flushFailed (PRD 03 RF6 — fecha received = flushedOk + flushFailed + buffered).
      const { requeue, discard } = planRequeue(failed.length, _buffer.length, BUFFER_MAX);
      _buffer.unshift(...failed.slice(0, requeue));
      if (discard > 0) {
        noteFlush(false, discard);
        logger.warn({ discarded: discard }, "analytics: excedente do buffer descartado em flush degradado");
      }
    } else if (failed.length > 0) {
      noteFlush(false, failed.length);
      logger.warn({ dropped: failed.length }, "analytics: eventos inválidos descartados no flush");
    }
  } finally {
    _flushing = false;
  }
}

setInterval(() => { void flushBuffer(); }, 30_000);

function pushEvent(ev: AnalyticsEvent): void {
  _buffer.push(ev);
  // Teto duro (PRD 03 RF6): banco fora por muito tempo não pode estourar a memória.
  // Descarta os MAIS ANTIGOS (os novos têm mais chance de flush com geo retro-preenchida)
  // e conta o descarte (flushFailed).
  const excess = capExcess(_buffer.length, 2 * BUFFER_MAX);
  if (excess > 0) { _buffer.splice(0, excess); noteFlush(false, excess); }
  if (_buffer.length >= BUFFER_MAX) void flushBuffer();
}

/** Drena o buffer imediatamente — chamado no shutdown para não perder eventos no deploy. */
export async function flushAnalyticsBuffer(): Promise<void> {
  await flushBuffer();
}

/** Eventos ainda não persistidos (usado pelo realtime-stats para dados sem atraso). */
export function getPendingAnalyticsEvents(): AnalyticsEvent[] {
  return [..._buffer];
}

// ─── Tráfego interno ──────────────────────────────────────────────────────────
// IPs internos: fonte única em lib/internalTraffic.ts (compartilhada com routes/ads.ts).

// Campanhas de tráfego pago (PRD 05 RF-3) — memoizado no padrão do internalIpSet:
// devolve só as `active:true` (a janela de datas é decidida por ingest na
// matchesPaidCampaign, com o todayKey do momento). Settings malformadas → [].
let _paidCampaignsRaw = "";
let _activePaidCampaigns: PaidCampaign[] = [];
function activePaidCampaigns(): PaidCampaign[] {
  const arr = store.getSettings().paidCampaigns;
  const raw = JSON.stringify(arr ?? []);
  if (raw !== _paidCampaignsRaw) {
    _paidCampaignsRaw = raw;
    _activePaidCampaigns = Array.isArray(arr)
      ? arr.filter((c): c is PaidCampaign =>
          !!c && typeof c === "object" && typeof c.id === "string" && c.active === true)
      : [];
  }
  return _activePaidCampaigns;
}

// ─── IP Geolocation via ip-api.com (async, cached, non-blocking) ──────────────
// LIMITAÇÃO CONHECIDA (decisão registrada): plano grátis do ip-api é HTTP-only e
// veta uso comercial. A agregação já é agnóstica de provedor (lê city/region das
// linhas de evento) — trocar de provedor = trocar só esta função.
interface GeoResult { city: string; region: string; country: string }
const _geoCache = new Map<string, GeoResult | null>();
const _geoPending = new Set<string>();

/** Soma 1 view da cidade em geo_stats — contador all-time legado (o /stats agrega
 *  cidade/estado por evento na janela; esta tabela fica só como histórico bruto). */
function bumpGeoViews(geo: GeoResult): void {
  const id = `${geo.city}::${geo.region}`;
  void db
    .insert(geoStatsTable)
    .values({ id, city: geo.city, region: geo.region, country: geo.country, views: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: geoStatsTable.id,
      set: {
        views:     sql`${geoStatsTable.views} + 1`,
        updatedAt: new Date(),
      },
    })
    .catch(() => { /* ignore */ });
}

function lookupGeoAsync(ip: string): void {
  if (isPrivateIp(ip)) return;
  if (_geoCache.has(ip) || _geoPending.has(ip)) return;

  _geoPending.add(ip);
  fetch(`http://ip-api.com/json/${normalizeIp(ip)}?fields=status,city,regionName,countryCode&lang=pt-BR`, {
    signal: AbortSignal.timeout(3000),
  })
    .then(async (r) => {
      if (!r.ok) return;
      const d = await r.json() as { status: string; city?: string; regionName?: string; countryCode?: string };
      if (d.status !== "success" || !d.city) return;
      const geo: GeoResult = {
        city:    d.city,
        region:  d.regionName ?? "",
        country: d.countryCode ?? "BR",
      };
      _geoCache.set(ip, geo);
      bumpGeoViews(geo); // conta o pageview que originou o lookup
      // Retro-preenche eventos deste IP ainda no buffer (o 1º pageview de um IP
      // chegava sem cidade porque o lookup é assíncrono).
      for (const ev of _buffer) {
        if (ev._ip === ip && !ev.city) { ev.city = geo.city; ev.region = geo.region; }
      }
    })
    .catch(() => { _geoCache.set(ip, null); })
    .finally(() => { _geoPending.delete(ip); });
}

// ─── POST /api/analytics/event ────────────────────────────────────────────────
router.post("/event", (req, res) => {
  // Bots e flood: descarte silencioso — nunca falha para o cliente.
  if (isBotRequest(req)) { bumpHealth("droppedBot"); res.json({ ok: true }); return; }
  // trust proxy (app.ts) já resolve o X-Forwarded-For adicionado pelo Caddy;
  // ler o header na mão pegaria o primeiro valor, que o cliente pode forjar.
  const ip = normalizeIp(req.ip ?? "");
  if (overRateLimit(`ev:${ip}`, INGEST_RATE_LIMITS.event)) { bumpHealth("droppedRate"); res.json({ ok: true }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;

  const type = typeof b["type"] === "string" && VALID_TYPES.has(b["type"] as string)
    ? (b["type"] as AnalyticsEvent["type"])
    : null;
  const path      = cleanStr(b["path"], 500);
  const sessionId = cleanStr(b["sessionId"], 100);
  if (!type || !path || !sessionId) {
    bumpHealth("droppedInvalid");
    logger.debug({ reason: "payload" }, "analytics: evento descartado");
    res.status(400).json({ ok: false });
    return;
  }
  // Navegação no painel não é audiência do site (o cliente já filtra; defesa extra).
  if (path.startsWith("/admin")) { bumpHealth("droppedInvalid"); res.json({ ok: true }); return; }

  // F5 em sequência não é audiência nova: mesma sessão+página em <15s é descartada.
  if (type === "pageview" && isRecentDuplicate(`pv:${sessionId}|${path}`, 15_000)) {
    bumpHealth("droppedDuplicate");
    logger.debug({ reason: "duplicate", path }, "analytics: evento descartado");
    res.json({ ok: true });
    return;
  }
  // PRD 03 RF2: F5/remount na página de categoria não é clique novo (o pageview já
  // é dedupado — o evento `category` escapava). Chave `cat:` própria, mesma janela.
  if (type === "category" && isRecentDuplicate(`cat:${sessionId}|${path}`, 15_000)) {
    bumpHealth("droppedDuplicate");
    res.json({ ok: true });
    return;
  }

  // Tráfego interno: marcado e gravado (auditável), mas fora das métricas públicas.
  // PRD 03 RF4: mesma tripla, agora com atribuição de razão (flag/configuredIp/privateIp).
  const det = detectInternalRequest(b["internal"] === true, ip);
  const isInternal = det.internal;
  if (isInternal && det.reason) { bumpHealth("flaggedInternal"); bumpInternalReason(det.reason); }

  const title     = cleanStr(b["title"], 300);
  const category  = cleanStr(b["category"], 100);
  const articleId = cleanStr(b["articleId"], 100);
  const platform  = cleanStr(b["platform"], 50);
  const visitorId = cleanStr(b["visitorId"], 64);

  // Sinais crus de origem — quem classifica o canal é o servidor.
  const utmSource   = cleanStr(b["utmSource"], 120);
  const utmMedium   = cleanStr(b["utmMedium"], 120);
  const utmCampaign = cleanStr(b["utmCampaign"], 120);
  const refHost     = cleanStr(b["refHost"], 253)?.toLowerCase().replace(/^www\./, "");
  const paidClick   = b["paidClick"] === true;                // legado (bundle antigo, fundido)
  const gclid       = b["gclid"] === true;                    // presença de gclid (Google)
  const fbclid      = b["fbclid"] === true;                   // presença de fbclid (Meta)
  const legacyChannel = cleanStr(b["referrer"], 20); // bundle antigo: direto|busca|social|outro

  // Canal só no pageview de entrada da sessão (first-touch); navegações internas
  // não reenviam origem. `firstTouch` marca inclusive a entrada direta sem sinais.
  const firstTouch = b["firstTouch"] === true ||
    Boolean(refHost || utmSource || utmMedium || paidClick || gclid || fbclid || legacyChannel);
  // PRD 05: "pago" só via campanha ativa cadastrada (activePaidCampaigns); gclid/fbclid
  // órfãos caem em social/busca. O servidor continua sendo o único que classifica.
  const referrer = firstTouch
    ? (isInternal ? "interno" : classifyChannel(
        { utmSource, utmMedium, utmCampaign, paidClick, gclid, fbclid, refHost, legacyChannel },
        activePaidCampaigns(),
        brtDayKey(Date.now()),
      ))
    : undefined;

  const durationRaw = Number(b["duration"]);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.min(Math.round(durationRaw), MAX_READ_SECONDS)
    : undefined;

  const scrollRaw   = Number(b["scrollDepth"]);
  const scrollDepth = SCROLL_MILESTONES.has(scrollRaw) ? scrollRaw : undefined;

  const ua = String(req.headers["user-agent"] ?? "");
  const { browser, os } = parseUa(ua);

  const cachedGeo = _geoCache.get(ip);
  if (type === "pageview" && !isInternal) {
    if (cachedGeo) bumpGeoViews(cachedGeo);
    else lookupGeoAsync(ip);
  }

  bumpHealth("received");
  noteEvent();
  pushEvent({
    type, path, title, category, articleId, sessionId, duration,
    device: detectDevice(ua),
    ts: Date.now(),
    ua,
    referrer,
    scrollDepth,
    platform,
    city:   cachedGeo?.city,
    region: cachedGeo?.region,
    visitorId,
    utmSource, utmMedium, utmCampaign, refHost,
    // Só grava click-id na linha first-touch (RF-4); demais/legado ficam NULL.
    gclid:  firstTouch ? gclid : undefined,
    fbclid: firstTouch ? fbclid : undefined,
    isInternal,
    browser, os,
    _ip: isPrivateIp(ip) ? undefined : ip,
  });

  // Contadores all-time (fallback de título / monitor) também não devem inflar
  // com navegação interna.
  if (!isInternal) {
    if (type === "category" && category) store.trackCategoryView(category);
    if (type === "pageview" && articleId && title) store.trackArticleView(articleId, title);
  }

  res.json({ ok: true });
});

// ─── POST /api/analytics/behavior — track search / link_click / newsletter ────
router.post("/behavior", async (req, res) => {
  try {
    if (isBotRequest(req)) { bumpEndpoint("behavior", "droppedBot"); res.json({ ok: true }); return; }
    const ip = normalizeIp(req.ip ?? "");
    if (overRateLimit(`bh:${ip}`, INGEST_RATE_LIMITS.behavior)) { bumpEndpoint("behavior", "droppedRate"); res.json({ ok: true }); return; }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const eventType = cleanStr(b["eventType"], 30);
    const sessionId = cleanStr(b["sessionId"], 100);
    if (!eventType || !sessionId) { bumpEndpoint("behavior", "droppedInvalid"); res.status(400).json({ ok: false }); return; }

    if (!BEHAVIOR_TYPES.has(eventType)) { bumpEndpoint("behavior", "droppedInvalid"); res.status(400).json({ ok: false }); return; }

    // PRD 03 RF3: tráfego interno agora é MARCADO (is_internal), não mais dropado
    // (§17 "marcado, nunca dropado"). Tripla COMPLETA — inclui isPrivateIp, que
    // faltava aqui (evento de rede privada entrava como público).
    const det = detectInternalRequest(b["internal"] === true, ip);
    if (det.internal && det.reason) { bumpEndpoint("behavior", "flaggedInternal"); bumpInternalReason(det.reason); }

    const value     = cleanStr(b["value"], 500);
    const articleId = cleanStr(b["articleId"], 100);

    const ua = String(req.headers["user-agent"] ?? "");
    await db.insert(behaviorEventsTable).values({
      eventType,
      value:     value ?? null,
      sessionId,
      device:    detectDevice(ua),
      articleId: articleId ?? null,
      ts:        new Date(),
      isInternal: det.internal,
    });
    bumpEndpoint("behavior", "received");
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // silent — never fail the client
  }
});

// ─── Gatherer de alertas de saúde (PRD 08 RF4) ───────────────────────────────
// Segmentos que dependem do BANCO (o resto do input vem dos contadores, frescos e
// O(1)). Cada consulta é bounded (janelas de 2–35 dias) e tem try/catch próprio →
// falha vira `db_error` no skipped, nunca derruba o /health. Memoizado por TTL de
// 60s: o painel dá auto-refresh a cada 30s e pode haver N abas — o TTL corta o
// custo sem tornar o alerta velho. 100% LEITURA (nenhum UPDATE/DELETE).
const HEALTH_ALERT_TTL_MS = 60_000;
interface HealthDbSegments {
  internalShare: HealthAlertInput["internalShare"];
  adDays: HealthAlertInput["adDays"];
  paid: HealthAlertInput["paid"];
  reservedBehaviorCount: HealthAlertInput["reservedBehaviorCount"];
  /** Ids cuja query FALHOU (o motor usa razão-padrão do segmento; aqui reatribuímos db_error). */
  dbErrorIds: string[];
}
let _healthDbCache: { at: number; seg: HealthDbSegments } | null = null;

async function gatherHealthDbSegments(adsReliableSince: string | null): Promise<HealthDbSegments> {
  const cached = _healthDbCache;
  if (cached && Date.now() - cached.at < HEALTH_ALERT_TTL_MS) return cached.seg;

  const now = Date.now();
  const dbErrorIds: string[] = [];
  const d7 = new Date(now - 7 * DAY);
  const d35 = new Date(now - 35 * DAY);

  // 1. internalShare — pageviews 35d: 7d recentes vs 28d anteriores (is_internal por FILTER).
  let internalShare: HealthDbSegments["internalShare"] = null;
  try {
    const r = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE ts >= ${d7})::int                  AS recent_total,
        count(*) FILTER (WHERE ts >= ${d7} AND is_internal)::int  AS recent_internal,
        count(*) FILTER (WHERE ts <  ${d7})::int                  AS prior_total,
        count(*) FILTER (WHERE ts <  ${d7} AND is_internal)::int  AS prior_internal
      FROM analytics_events
      WHERE type = 'pageview' AND ts >= ${d35}
    `);
    const row = (r.rows?.[0] ?? {}) as { recent_total?: number; recent_internal?: number; prior_total?: number; prior_internal?: number };
    internalShare = {
      recentTotal: row.recent_total ?? 0, recentInternal: row.recent_internal ?? 0,
      priorTotal: row.prior_total ?? 0, priorInternal: row.prior_internal ?? 0,
    };
  } catch { internalShare = null; dbErrorIds.push("internal_share_shift"); }

  // 2. adDays — sanidade só para os 2 dias BRT mais recentes E >= adsReliableSince
  //    (datas anteriores ao reparo do PRD 04 NUNCA são avaliadas — CA8). Sem
  //    adsReliableSince → segmento null + skip prd04_reparo_pendente (padrão do motor).
  let adDays: HealthDbSegments["adDays"] = null;
  if (adsReliableSince != null) {
    try {
      const todayKey = brtDayKey(now);
      const yestKey  = brtDayKey(now - DAY);
      const sinceYest = new Date(brtDayStartMs(yestKey));
      const [adRes, pvRes] = await Promise.all([
        db.execute(sql`
          SELECT ad_id, date, impressions, clicks
          FROM ad_daily_stats
          WHERE date IN (${yestKey}, ${todayKey}) AND date >= ${adsReliableSince}
        `),
        db.execute(sql`
          SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date::text AS day, count(*)::int AS pageviews
          FROM analytics_events
          WHERE type = 'pageview' AND is_internal = false AND ts >= ${sinceYest}
          GROUP BY 1
        `),
      ]);
      const pvMap = new Map<string, number>();
      for (const p of (pvRes.rows ?? []) as { day?: string; pageviews?: number }[]) {
        if (p.day) pvMap.set(p.day, p.pageviews ?? 0);
      }
      adDays = ((adRes.rows ?? []) as { ad_id?: string; date?: string; impressions?: number; clicks?: number }[]).map((a) => {
        const date = String(a.date ?? "");
        return { adId: String(a.ad_id ?? ""), date, impressions: a.impressions ?? 0, clicks: a.clicks ?? 0, pageviews: pvMap.get(date) ?? 0 };
      });
    } catch { adDays = null; dbErrorIds.push("ad_sanity", "ad_clicks_gt_impressions"); }
  }

  // 3. paid — campanhas ativas (memo do PRD 05) + linhas 'pago' pós-corte PAID_RULE_SINCE.
  let paid: HealthDbSegments["paid"] = null;
  try {
    const cutoff = new Date(brtDayStartMs(PAID_RULE_SINCE));
    const r = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM analytics_events
      WHERE referrer = 'pago' AND ts >= ${cutoff}
    `);
    const n = ((r.rows?.[0] ?? {}) as { n?: number }).n ?? 0;
    paid = { activeCampaigns: activePaidCampaigns().length, paidLinesSinceRule: n };
  } catch { paid = null; dbErrorIds.push("paid_without_campaign"); }

  // 4. reservedBehaviorCount — video_play/download nos últimos 30 dias (internos INCLUÍDOS:
  //    é anomalia de contrato, não métrica pública).
  let reservedBehaviorCount: number | null = null;
  try {
    const r = await db.execute(sql`
      SELECT count(*)::int AS n
      FROM behavior_events
      WHERE event_type IN ('video_play', 'download') AND ts >= ${new Date(now - 30 * DAY)}
    `);
    reservedBehaviorCount = ((r.rows?.[0] ?? {}) as { n?: number }).n ?? 0;
  } catch { reservedBehaviorCount = null; dbErrorIds.push("reserved_behavior_type"); }

  const seg: HealthDbSegments = { internalShare, adDays, paid, reservedBehaviorCount, dbErrorIds };
  _healthDbCache = { at: Date.now(), seg };
  return seg;
}

// ─── GET /api/analytics/health — saúde da coleta (admin) ─────────────────────
router.get("/health", authMiddleware, async (_req, res) => {
  // PRD 04 §7.3: marcador "dados de anúncio confiáveis desde" (null = reparo ainda
  // não rodou). Leitura direta com try/catch — endpoint de baixo tráfego.
  let adsReliableSince: string | null = null;
  try {
    const [row] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "ads_reliable_since"))
      .limit(1);
    adsReliableSince = row?.value ?? null;
  } catch { /* baixo tráfego — não derruba o /health */ }

  const snap = healthSnapshot({ buffered: _buffer.length });

  // Alertas automáticos (PRD 08). Gatherer nunca lança para o client: falha de
  // banco vira db_error no skipped; falha total responde o shape atual + alerts [].
  let alerts: HealthAlertDto[] = [];
  let alertsSkipped: SkippedRule[] = [];
  try {
    const seg = await gatherHealthDbSegments(adsReliableSince);
    const input: HealthAlertInput = {
      counters: { received: snap.received, flushedOk: snap.flushedOk, flushFailed: snap.flushFailed, buffered: snap.buffered },
      bufferIdentityTolerance: 2 * BUFFER_MAX, // 1000 = lote em voo + teto do PRD 03 RF6
      internalByReason: snap.internalByReason ?? null,
      internalShare: seg.internalShare,
      adDays: seg.adDays,
      adMargin: AD_SANITY_MARGIN,
      paid: seg.paid,
      reservedBehaviorCount: seg.reservedBehaviorCount,
    };
    const out = evaluateHealthAlerts(input);
    alerts = out.alerts;
    // Reatribui db_error às regras cuja query realmente falhou (o motor usa a razão
    // -padrão do segmento — prd04/prd05 — que aqui não se aplica).
    const errSet = new Set(seg.dbErrorIds);
    alertsSkipped = out.skipped.map((s) => (errSet.has(s.id) ? { ...s, reason: "db_error" } : s));
  } catch {
    alerts = [];
    alertsSkipped = [
      { id: "internal_share_shift", reason: "db_error" },
      { id: "ad_sanity", reason: "db_error" },
      { id: "ad_clicks_gt_impressions", reason: "db_error" },
      { id: "paid_without_campaign", reason: "db_error" },
      { id: "reserved_behavior_type", reason: "db_error" },
    ];
  }

  res.setHeader("Cache-Control", "private, no-store"); // PRD 09 RF3
  res.json({
    contractVersion: DASHBOARD_API_CONTRACT_VERSION, // PRD 09 RF1
    ...snap,
    reliableSince: ANALYTICS_V2_SINCE,
    adsReliableSince,
    filters: [
      "user-agent de bot/CLI (todos os endpoints: event, behavior, impressão e clique de anúncio)",
      "rate limit por IP: 120/min event, 30/min behavior, 60/min impressão, 30/min clique",
      "duplicado: pageview e category (mesma sessão+página em <15s); impressão/clique: dedup do PRD 04",
      "caminhos /admin",
      "tráfego interno marcado, nunca dropado (admin logado, dev, IPs configurados, rede privada) — event e behavior; ads: dimensão interna do PRD 04",
    ],
    alerts,
    alertsSkipped,
    // PRD 11 RF5: relatório da malha de sanidade cross-metric contínua (o motor roda
    // a cada ~15min no boot; aqui é só leitura O(1) da memória). evaluatedAt=null
    // enquanto o 1º ciclo não rodou (ou monitor desligado por SANITY_MONITOR_MS<=0).
    sanity: getSanityReport(),
  });
});

// ─── GET /api/analytics/stats ─────────────────────────────────────────────────
router.get("/stats", authMiddleware, requirePermission("analytics.view"), async (req, res) => {
  const now = Date.now();
  const win = resolvePeriod(req.query as { period?: unknown; from?: unknown; to?: unknown }, now);
  // PRD 09 RF4: recorte parametrizável de topArticles (default 10 = comportamento
  // atual byte-a-byte quando ausente; clamp [1,50] nunca erra).
  const topArticlesLimit = clampIntParam((req.query as { topArticlesLimit?: unknown }).topArticlesLimit, 10, 1, 50);
  // PRD 09 RF2: cache de curta duração. Chave inclui o recorte para nunca servir
  // um payload com topArticles de tamanho diferente do pedido nesta janela.
  const cacheKey = `${win.key}:${win.fromDay}:${win.toDay}:${topArticlesLimit}`;
  const cachedStats = STATS_CACHE.get(cacheKey, now);
  if (cachedStats) {
    res.setHeader("Cache-Control", "private, no-store"); // PRD 09 RF3
    res.setHeader("X-Cache", "HIT");
    res.json(cachedStats);
    return;
  }
  const winFrom  = new Date(win.fromMs);
  const winTo    = new Date(win.toMs);
  const prevFrom = new Date(win.prevFromMs);
  const prevTo   = new Date(win.prevToMs);

  // Janelas fixas dos totais (contrato do Dashboard: sempre relativas ao agora,
  // independentes do período selecionado no painel de Analytics).
  const todayStart     = new Date(brtDayStartMs(brtDayKey(now)));
  const yesterdayStart = new Date(todayStart.getTime() - DAY);
  const d7  = new Date(now - 7 * DAY);
  const d14 = new Date(now - 14 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);

  const [
    dbRows, totalsRes, prevAggRes, prevReadRes, prevBounceRes,
    geoAggRes, browserOsRes, visitorsRes,
    allAds, adDailyRows, adHasAnyRes, behaviorRows,
  ] = await Promise.all([
    // Projeção: só as colunas usadas no reducer (ua/city/region ficam de fora —
    // geo, navegador e SO vêm de queries agregadas próprias, mais baratas).
    db.select({
      type:        analyticsEventsTable.type,
      path:        analyticsEventsTable.path,
      title:       analyticsEventsTable.title,
      category:    analyticsEventsTable.category,
      articleId:   analyticsEventsTable.articleId,
      sessionId:   analyticsEventsTable.sessionId,
      duration:    analyticsEventsTable.duration,
      device:      analyticsEventsTable.device,
      ts:          analyticsEventsTable.ts,
      referrer:    analyticsEventsTable.referrer,
      scrollDepth: analyticsEventsTable.scrollDepth,
      platform:    analyticsEventsTable.platform,
      refHost:     analyticsEventsTable.refHost,
      utmCampaign: analyticsEventsTable.utmCampaign,
      utmMedium:   analyticsEventsTable.utmMedium,
      utmSource:   analyticsEventsTable.utmSource,
    }).from(analyticsEventsTable).where(and(
      gte(analyticsEventsTable.ts, winFrom),
      lt(analyticsEventsTable.ts, winTo),
      eq(analyticsEventsTable.isInternal, false),
    )),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE ts >= ${todayStart})::int                          AS today,
        count(*) FILTER (WHERE ts >= ${yesterdayStart} AND ts < ${todayStart})::int AS yesterday,
        count(*) FILTER (WHERE ts >= ${d7})::int                                  AS week,
        count(*) FILTER (WHERE ts >= ${d14} AND ts < ${d7})::int                  AS prev_week,
        count(*) FILTER (WHERE ts >= ${d30})::int                                 AS month,
        count(*) FILTER (WHERE ts >= ${d60} AND ts < ${d30})::int                 AS prev_month,
        count(*)::int                                                             AS all_time
      FROM analytics_events
      WHERE type = 'pageview' AND is_internal = false
    `),
    // Janela imediatamente anterior, de mesmo tamanho — base das tendências.
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE type = 'pageview')::int                   AS pv,
        count(DISTINCT session_id) FILTER (WHERE type = 'pageview')::int AS sessions,
        count(DISTINCT visitor_id) FILTER (WHERE type = 'pageview' AND visitor_id IS NOT NULL)::int AS visitors
      FROM analytics_events
      WHERE ts >= ${prevFrom} AND ts < ${prevTo} AND is_internal = false
    `),
    // Tempo médio anterior com a MESMA regra da janela atual: MAX cumulativo por
    // sessão+página (heartbeats são idempotentes), depois média.
    db.execute(sql`
      SELECT COALESCE(avg(md), 0)::float AS avg_read
      FROM (
        SELECT max(LEAST(duration, ${MAX_READ_SECONDS})) AS md
        FROM analytics_events
        WHERE type = 'read' AND duration > 0 AND is_internal = false
          AND ts >= ${prevFrom} AND ts < ${prevTo}
        GROUP BY session_id, path
      ) t
    `),
    db.execute(sql`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE c = 1)::int AS bounced
      FROM (
        SELECT session_id, count(*) AS c
        FROM analytics_events
        WHERE type = 'pageview' AND is_internal = false
          AND ts >= ${prevFrom} AND ts < ${prevTo}
        GROUP BY session_id
      ) s
    `),
    // Geo por evento DA JANELA (não mais o contador all-time de geo_stats);
    // cidade vazia vira "Não identificado" no fold — nunca inventamos local.
    db.execute(sql`
      SELECT COALESCE(city, '') AS city, COALESCE(region, '') AS region, count(*)::int AS views
      FROM analytics_events
      WHERE type = 'pageview' AND is_internal = false
        AND ts >= ${winFrom} AND ts < ${winTo}
      GROUP BY 1, 2
    `),
    db.execute(sql`
      SELECT COALESCE(browser, 'desconhecido') AS browser, COALESCE(os, 'desconhecido') AS os, count(*)::int AS views
      FROM analytics_events
      WHERE type = 'pageview' AND is_internal = false
        AND ts >= ${winFrom} AND ts < ${winTo}
      GROUP BY 1, 2
    `),
    // Visitantes únicos + recorrentes (recorrente = tem evento ANTES da janela).
    db.execute(sql`
      WITH win_visitors AS (
        SELECT DISTINCT visitor_id AS vid
        FROM analytics_events
        WHERE type = 'pageview' AND is_internal = false AND visitor_id IS NOT NULL
          AND ts >= ${winFrom} AND ts < ${winTo}
      )
      SELECT
        (SELECT count(*) FROM win_visitors)::int AS uniq,
        -- PRD 06 RF-2: "recorrente" = visitante da janela com pageview PÚBLICO
        -- anterior à janela — MESMOS filtros do uniq (is_internal=false, pageview).
        -- Sem eles, histórico 100% interno (ex.: operador logado) virava recorrente.
        (SELECT count(*) FROM win_visitors w WHERE EXISTS (
          SELECT 1 FROM analytics_events e WHERE e.visitor_id = w.vid AND e.ts < ${winFrom}
            AND e.is_internal = false AND e.type = 'pageview'
        ))::int AS returning
    `),
    db.select({
      id: adsTable.id, name: adsTable.name, position: adsTable.position,
      active: adsTable.active, createdAt: adsTable.createdAt,
    }).from(adsTable),
    db.select().from(adDailyStatsTable).where(and(
      gte(adDailyStatsTable.date, win.fromDay),
      lte(adDailyStatsTable.date, win.toDay),
    )),
    db.execute(sql`SELECT EXISTS (SELECT 1 FROM ad_daily_stats) AS has`),
    db.select().from(behaviorEventsTable).where(and(
      eq(behaviorEventsTable.isInternal, false), // PRD 03 RF3: exclui interno da leitura pública
      gte(behaviorEventsTable.ts, winFrom),
      lt(behaviorEventsTable.ts, winTo),
    )),
  ]);

  // Linhas do banco + buffer ainda não persistido (só não-internos).
  const rows: EventLike[] = [
    ...dbRows.map((r) => ({ ...r, ts: r.ts.getTime() })),
    ..._buffer.filter((ev) => !ev.isInternal),
  ];
  const agg = buildWindowAggregates(rows, win);

  // ── Derivados de engajamento ──────────────────────────────────────────────
  const uniqueSessions = Object.keys(agg.sessionPageviews).length;
  const readVals = [...agg.readMax.values()];
  const avgReadTime = readVals.length > 0
    ? Math.round(readVals.reduce((a, b) => a + b, 0) / readVals.length)
    : 0;
  const bounceSessions = Object.values(agg.sessionPageviews).filter((v) => v === 1).length;
  const bounceRate = uniqueSessions > 0 ? Math.round((bounceSessions / uniqueSessions) * 100) : 0;
  const readCompletions = agg.scrollSessions[100]?.size ?? 0;

  // ── Totais fixos (SQL) + buffer não persistido ────────────────────────────
  const t = (totalsRes.rows?.[0] ?? {}) as {
    today?: number; yesterday?: number; week?: number; prev_week?: number;
    month?: number; prev_month?: number; all_time?: number;
  };
  const bufPv = _buffer.filter((e) => e.type === "pageview" && !e.isInternal);
  const bufSince = (fromMs: number): number => bufPv.filter((e) => e.ts >= fromMs).length;
  const today   = (t.today ?? 0) + bufSince(todayStart.getTime());
  const week    = (t.week ?? 0) + bufSince(now - 7 * DAY);
  const month   = (t.month ?? 0) + bufSince(now - 30 * DAY);
  const allTime = (t.all_time ?? 0) + bufPv.length;
  const yesterday = t.yesterday ?? 0;

  // ── Tendências reais (null = sem base de comparação = sem badge) ──────────
  const prevAgg = (prevAggRes.rows?.[0] ?? {}) as { pv?: number; sessions?: number; visitors?: number };
  const prevAvgRead = Math.round(((prevReadRes.rows?.[0] ?? {}) as { avg_read?: number }).avg_read ?? 0);
  const prevBounceRow = (prevBounceRes.rows?.[0] ?? {}) as { total?: number; bounced?: number };
  const prevBounceTotal = prevBounceRow.total ?? 0;
  const prevBounceRate = prevBounceTotal > 0
    ? Math.round(((prevBounceRow.bounced ?? 0) / prevBounceTotal) * 100)
    : null;
  const visitorsRow = (visitorsRes.rows?.[0] ?? {}) as { uniq?: number; returning?: number };
  const visitorsUnique = visitorsRow.uniq ?? 0;
  const visitorsReturning = visitorsRow.returning ?? 0;

  const trends = {
    today:          pctChange(today, yesterday),
    week:           pctChange(week, t.prev_week ?? 0),
    month:          pctChange(month, t.prev_month ?? 0),
    window:         pctChange(agg.windowPv, prevAgg.pv ?? 0),
    uniqueSessions: pctChange(uniqueSessions, prevAgg.sessions ?? 0),
    visitors:       pctChange(visitorsUnique, prevAgg.visitors ?? 0),
    avgReadTime:    pctChange(avgReadTime, prevAvgRead),
    // Rejeição: diferença em pontos percentuais (variação % de uma taxa confunde).
    bounceRate:     prevBounceRate !== null ? Math.round((bounceRate - prevBounceRate) * 10) / 10 : null,
  };

  // ── Rankings da janela ────────────────────────────────────────────────────
  const articleReadAgg: Record<string, { total: number; n: number }> = {};
  for (const [key, dur] of agg.articleReadMax) {
    const aid = key.slice(0, key.indexOf("|"));
    const cur = articleReadAgg[aid] ?? (articleReadAgg[aid] = { total: 0, n: 0 });
    cur.total += dur;
    cur.n++;
  }
  const persistedTitles = store.getArticleViews();
  const topArticles = Object.entries(agg.articleMap)
    .map(([id, a]) => {
      const read = articleReadAgg[id];
      return {
        id,
        title:   a.title || persistedTitles[id]?.title || id,
        views:   a.views,
        avgTime: read && read.n > 0 ? Math.round(read.total / read.n) : undefined,
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, topArticlesLimit); // PRD 09 RF4

  const publishedArticles = (await articleService.getArticles()).filter((a) => a.status === "published");
  const articleCountByCategory: Record<string, number> = {};
  for (const a of publishedArticles) {
    if (a.category) articleCountByCategory[a.category] = (articleCountByCategory[a.category] ?? 0) + 1;
  }
  const allCatNames = new Set([
    ...Object.keys(agg.catViewMap),
    ...Object.keys(agg.catClickMap),
    ...Object.keys(articleCountByCategory),
  ]);
  const topCategories = Array.from(allCatNames).map((name) => ({
    name,
    views:    agg.catViewMap[name]  ?? 0,
    clicks:   agg.catClickMap[name] ?? 0,
    articles: articleCountByCategory[name] ?? 0,
  })).sort(compareTopCategories).slice(0, 10); // PRD 06 RF-1: acessos DESC, artigos DESC, nome ASC

  const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // ── Localização (eventos da janela; vazio = "Não identificado") ───────────
  const cityTotals:   Record<string, number> = {};
  const regionTotals: Record<string, number> = {};
  for (const row of (geoAggRes.rows ?? []) as { city?: string; region?: string; views?: number }[]) {
    const views = row.views ?? 0;
    const city   = row.city   && row.city.length   > 0 ? row.city   : "Não identificado";
    const region = row.region && row.region.length > 0 ? row.region : "Não identificado";
    cityTotals[city]     = (cityTotals[city]     ?? 0) + views;
    regionTotals[region] = (regionTotals[region] ?? 0) + views;
  }

  // ── Navegador / SO ────────────────────────────────────────────────────────
  const browserTotals: Record<string, number> = {};
  const osTotals:      Record<string, number> = {};
  for (const row of (browserOsRes.rows ?? []) as { browser?: string; os?: string; views?: number }[]) {
    const views = row.views ?? 0;
    browserTotals[row.browser ?? "desconhecido"] = (browserTotals[row.browser ?? "desconhecido"] ?? 0) + views;
    osTotals[row.os ?? "desconhecido"]           = (osTotals[row.os ?? "desconhecido"] ?? 0) + views;
  }
  const toTopList = (m: Record<string, number>, n: number) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, views]) => ({ name, views }));

  // ── Ads: números DA JANELA (ad_daily_stats); all-time fica no AdsManager ──
  const adWindowTotals: Record<string, { impressions: number; clicks: number }> = {};
  for (const row of adDailyRows) {
    const cur = adWindowTotals[row.adId] ?? (adWindowTotals[row.adId] = { impressions: 0, clicks: 0 });
    cur.impressions += row.impressions;
    cur.clicks      += row.clicks;
  }
  // Blocos da home/lateral marcados "É uma propaganda" são inventário medido
  // também: pseudo-anúncios com chave block:<id> (contadores só no diário).
  const blockAds = new Map<string, { name: string; active: boolean }>();
  {
    const s = store.getSettings();
    for (const list of [s.homeBlocks ?? [], s.articleSidebarBlocks ?? []]) {
      for (const b of list) {
        if (b.isAd === true && !blockAds.has(b.id)) {
          blockAds.set(b.id, { name: b.name, active: b.visible !== false });
        }
      }
    }
  }
  const buildAdStat = (id: string, name: string, position: string, active: boolean) => {
    const wTot = adWindowTotals[id];
    const impressions = wTot?.impressions ?? 0;
    const clicks      = wTot?.clicks ?? 0;
    return {
      id, name, position, active, impressions, clicks,
      ctr:     impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      hasData: wTot !== undefined, // distingue "sem dados no período" de zero real
    };
  };
  const adStats = [
    ...allAds.map((ad) => buildAdStat(ad.id, ad.name, ad.position, ad.active)),
    ...[...blockAds.entries()].map(([bid, meta]) =>
      buildAdStat(`block:${bid}`, meta.name, "bloco da home", meta.active)),
  ].sort((a, b) => b.impressions - a.impressions);

  const top3AdIds = adStats.slice(0, 3).map((a) => a.id);
  const adDailyByDate: Record<string, Record<string, { impressions: number; clicks: number }>> = {};
  for (let ms = win.fromMs; ms < win.toMs; ms += DAY) {
    const d = brtDayKey(ms);
    adDailyByDate[d] = {};
    for (const adId of top3AdIds) adDailyByDate[d]![adId] = { impressions: 0, clicks: 0 };
  }
  // PRD 04 RF5: ACUMULAR (não sobrescrever). Pós-RF1/RF2 há 1 linha por par e `=`/`+=`
  // coincidem; o acúmulo mantém o gráfico consistente com adWindowTotals mesmo durante
  // qualquer estado transitório com linhas duplicadas residuais (defesa em profundidade).
  for (const row of adDailyRows) {
    const slot = adDailyByDate[row.date]?.[row.adId];
    if (slot) { slot.impressions += row.impressions; slot.clicks += row.clicks; }
  }
  const adDailyChart = Object.entries(adDailyByDate).map(([date, byAd]) => {
    const entry: Record<string, unknown> = { date };
    for (const adId of top3AdIds) {
      const adName = adStats.find((a) => a.id === adId)?.name ?? adId;
      entry[adName] = byAd[adId]?.impressions ?? 0;
    }
    return entry;
  });

  const totalAdImpressions = adStats.reduce((s, a) => s + a.impressions, 0);
  const totalAdClicks      = adStats.reduce((s, a) => s + a.clicks, 0);
  const avgCtr             = totalAdImpressions > 0
    ? Number(((totalAdClicks / totalAdImpressions) * 100).toFixed(2))
    : 0;
  const adsWithData = adStats.filter((a) => a.impressions > 0);
  const bestAd = adsWithData.length > 0
    ? adsWithData.reduce((best, a) => (a.ctr > best.ctr ? a : best), adsWithData[0]!)
    : null;
  const adHasAnyData = Boolean(((adHasAnyRes.rows?.[0] ?? {}) as { has?: boolean }).has);

  // ── Behavior stats (janela) — PRD 07: tops truncados + totais NÃO truncados ──
  // Agregação extraída para função pura (testável); a query já exclui interno em
  // SQL (PRD 03 RF3) e a função reforça (defesa em profundidade).
  const behaviorStats = buildBehaviorStats(behaviorRows);

  const maxHourViews = Math.max(...agg.byHour);
  // PRD 06 RF-3: pico por dia da semana normalizado pelas ocorrências de cada dia
  // na janela (elimina o viés estrutural da soma bruta).
  const dowOcc = dowOccurrences(win);
  const peakDowIdx = pickPeakDow(agg.byDow, dowOcc);

  const payload = {
    contractVersion: DASHBOARD_API_CONTRACT_VERSION, // PRD 09 RF1
    period: { key: win.key, from: win.fromDay, to: win.toDay, label: win.label, days: win.days },
    totals: { today, week, month, allTime, window: agg.windowPv },
    engagement: { uniqueSessions, avgReadTime, bounceRate, readCompletions },
    visitors: {
      unique:    visitorsUnique,
      new:       Math.max(0, visitorsUnique - visitorsReturning),
      returning: visitorsReturning,
      since:     ANALYTICS_V2_SINCE, // antes desta data não havia visitor_id
    },
    trends,
    dailyChart:      Object.entries(agg.byDay).map(([date, views]) => ({ date, views })),
    hourlyChart:     agg.byHour.map((views, hour) => ({ hour, views })),
    peakHour:        maxHourViews > 0 ? agg.byHour.indexOf(maxHourViews) : null,
    dayOfWeekChart:  agg.byDow.map((views, day) => {
      const o = dowOcc[day] ?? 0;
      return { day: DAY_NAMES[day]!, views, occurrences: o, avg: o > 0 ? Math.round((views / o) * 10) / 10 : null };
    }),
    peakDay:         peakDowIdx !== null ? DAY_NAMES[peakDowIdx]! : null,
    topArticles,
    topCategories,
    topCities:  Object.entries(cityTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, views]) => ({ name, views })),
    topRegions: Object.entries(regionTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, views]) => ({ name, views })),
    devices:         agg.deviceMap,
    browsers:        toTopList(browserTotals, 8),
    osList:          toTopList(osTotals, 8),
    scrollDepthChart: [25, 50, 75, 100].map((depth) => ({ depth, count: agg.scrollSessions[depth]?.size ?? 0 })),
    referrerChart:   Object.entries(agg.channelMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    topRefHosts:     toTopList(agg.refHostMap, 10),
    topCampaigns:    toTopList(agg.campaignMap, 10),
    shareChart:      Object.entries(agg.shareMap).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count),
    // Ad analytics (janela selecionada)
    adStats,
    adDailyChart,
    adTopNames: top3AdIds.map((id) => adStats.find((a) => a.id === id)?.name ?? id),
    adHasAnyData,
    adKpis: {
      totalImpressions: totalAdImpressions,
      totalClicks:      totalAdClicks,
      avgCtr,
      bestAdName:       bestAd?.name ?? null,
      bestAdCtr:        bestAd?.ctr ?? 0,
    },
    // Behavior analytics (PRD 07 — contrato aditivo: tops + totais + distintos)
    behaviorStats,
  };

  STATS_CACHE.set(cacheKey, payload, now); // PRD 09 RF2
  res.setHeader("Cache-Control", "private, no-store"); // PRD 09 RF3
  res.setHeader("X-Cache", "MISS");
  res.json(payload);
});

export default router;
