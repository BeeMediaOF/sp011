/**
 * ingestHandlers — núcleo TESTÁVEL (sem I/O direto, SEM timer) das rotas de ingest
 * de analytics/anúncios. PRD 12 RF2/CA2.
 *
 * Por que existe: `routes/analytics.ts` cria um `setInterval(flush, 30s)` no escopo de
 * módulo SEM `.unref()` (o buffer de eventos). Importar esse módulo numa suite
 * `node --test` mantém o event loop vivo e o processo NUNCA termina. Para poder
 * exercitar o control-flow das rotas (bot/rate/dedup/interno/inválido) com `node --test`
 * e colaboradores FAKE, o corpo dos handlers vive aqui — num módulo LIVRE do timer.
 *
 * REGRA DE OURO: comportamento byte-idêntico ao das rotas originais. As rotas viraram
 * cascas finas que montam `deps` reais (buffer, store, contadores, db) e delegam. NENHUMA
 * decisão nova mora aqui — é a MESMA lógica, com os colaboradores injetáveis para o teste.
 * 100% dos efeitos passam por `deps`; este módulo não importa `db`, `store` nem `logger`.
 */
// Imports de VALOR usam extensão .ts explícita: este módulo é alvo direto de
// node --test (PRD 12) e, sem o dist buildado, só o .ts existe — o .js quebraria com
// ERR_MODULE_NOT_FOUND (só `import type` é apagado). .ts resolve nos 3 contextos:
// node --test, esbuild (bundle) e tsc (allowImportingTsExtensions + noEmit).
import {
  VALID_TYPES, SCROLL_MILESTONES, MAX_READ_SECONDS,
  cleanStr, normalizeIp, isPrivateIp, detectDevice, parseUa, classifyChannel, brtDayKey,
  type PaidCampaign, type InternalReason,
} from "./analyticsShared.ts";
import { INGEST_RATE_LIMITS, isBotUa } from "./trafficGuard.ts";
import type { EndpointCounters, IngestEndpointId } from "./analyticsHealth.js";

// ── Tipos compartilhados (movidos de routes/analytics.ts; a rota os re-exporta) ──
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

export interface GeoResult { city: string; region: string; country: string; hosting?: boolean }

/** Descritor de resposta HTTP (a casca faz `res.status(out.status ?? 200).json(out.body)`). */
export interface HandlerResult { status?: number; body: unknown }

type EventHealthKey = "droppedBot" | "droppedRate" | "droppedInvalid" | "droppedDuplicate" | "flaggedInternal" | "received";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analytics/event
// ─────────────────────────────────────────────────────────────────────────────
export interface EventHandlerDeps {
  now(): number;
  overRateLimit(key: string, maxPerMinute: number): boolean;
  isRecentDuplicate(key: string, windowMs: number): boolean;
  detectInternalRequest(bodyFlag: boolean, ip: string): { internal: boolean; reason: InternalReason | null };
  activePaidCampaigns(): PaidCampaign[];
  bumpHealth(key: EventHealthKey): void;
  bumpInternalReason(reason: InternalReason): void;
  noteEvent(): void;
  getCachedGeo(ip: string): GeoResult | null | undefined;
  bumpGeoViews(geo: GeoResult): void;
  lookupGeoAsync(ip: string): void;
  pushEvent(ev: AnalyticsEvent): void;
  trackCategoryView(category: string): void;
  trackArticleView(articleId: string, title: string): void;
  /** logger.debug injetado (opcional): evita acoplar o handler ao logger de I/O. */
  onDebug?(info: Record<string, unknown>, msg: string): void;
}

export interface EventHandlerInput {
  /** `req.ip ?? ""` cru; o handler normaliza (como a rota original). */
  ipRaw: string;
  ua: string;
  body: Record<string, unknown>;
}

export function handleEvent(deps: EventHandlerDeps, input: EventHandlerInput): HandlerResult {
  // Bots e flood: descarte silencioso — nunca falha para o cliente.
  if (isBotUa(input.ua)) { deps.bumpHealth("droppedBot"); return { body: { ok: true } }; }
  const ip = normalizeIp(input.ipRaw);
  if (deps.overRateLimit(`ev:${ip}`, INGEST_RATE_LIMITS.event)) { deps.bumpHealth("droppedRate"); return { body: { ok: true } }; }

  const b = input.body;
  const type = typeof b["type"] === "string" && VALID_TYPES.has(b["type"] as string)
    ? (b["type"] as AnalyticsEvent["type"])
    : null;
  const path      = cleanStr(b["path"], 500);
  const sessionId = cleanStr(b["sessionId"], 100);
  if (!type || !path || !sessionId) {
    deps.bumpHealth("droppedInvalid");
    deps.onDebug?.({ reason: "payload" }, "analytics: evento descartado");
    return { status: 400, body: { ok: false } };
  }
  // Navegação no painel não é audiência do site (o cliente já filtra; defesa extra).
  if (path.startsWith("/admin")) { deps.bumpHealth("droppedInvalid"); return { body: { ok: true } }; }

  // F5 em sequência não é audiência nova: mesma sessão+página em <15s é descartada.
  if (type === "pageview" && deps.isRecentDuplicate(`pv:${sessionId}|${path}`, 15_000)) {
    deps.bumpHealth("droppedDuplicate");
    deps.onDebug?.({ reason: "duplicate", path }, "analytics: evento descartado");
    return { body: { ok: true } };
  }
  // PRD 03 RF2: F5/remount na página de categoria não é clique novo (o pageview já
  // é dedupado — o evento `category` escapava). Chave `cat:` própria, mesma janela.
  if (type === "category" && deps.isRecentDuplicate(`cat:${sessionId}|${path}`, 15_000)) {
    deps.bumpHealth("droppedDuplicate");
    return { body: { ok: true } };
  }

  // Tráfego interno: marcado e gravado (auditável), mas fora das métricas públicas.
  // Rede de data center/Meta (scanner de link) também é interna — razão "hosting", vinda
  // do geo por IP: já cacheado → síncrono aqui; IP novo → retro-marcado quando o lookup
  // resolve (lookupGeoAsync). Buscamos o geo cacheado UMA vez (reusado na seção de geo).
  const det = deps.detectInternalRequest(b["internal"] === true, ip);
  const cachedGeo = deps.getCachedGeo(ip);
  const hostingHit = !det.internal && cachedGeo?.hosting === true;
  const isInternal = det.internal || hostingHit;
  const internalReason: InternalReason | null = det.reason ?? (hostingHit ? "hosting" : null);
  if (isInternal && internalReason) { deps.bumpHealth("flaggedInternal"); deps.bumpInternalReason(internalReason); }

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

  const now = deps.now();
  // Canal só no pageview de entrada da sessão (first-touch); navegações internas
  // não reenviam origem. `firstTouch` marca inclusive a entrada direta sem sinais.
  const firstTouch = b["firstTouch"] === true ||
    Boolean(refHost || utmSource || utmMedium || paidClick || gclid || fbclid || legacyChannel);
  // PRD 05: "pago" só via campanha ativa cadastrada; gclid/fbclid órfãos caem em
  // social/busca. O servidor continua sendo o único que classifica.
  const referrer = firstTouch
    ? (isInternal ? "interno" : classifyChannel(
        { utmSource, utmMedium, utmCampaign, paidClick, gclid, fbclid, refHost, legacyChannel },
        deps.activePaidCampaigns(),
        brtDayKey(now),
      ))
    : undefined;

  const durationRaw = Number(b["duration"]);
  const duration = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.min(Math.round(durationRaw), MAX_READ_SECONDS)
    : undefined;

  const scrollRaw   = Number(b["scrollDepth"]);
  const scrollDepth = SCROLL_MILESTONES.has(scrollRaw) ? scrollRaw : undefined;

  const { browser, os } = parseUa(input.ua);

  // cachedGeo já foi lido acima (para a decisão de hosting). Pageview de hosting/interno
  // não conta geo; IP novo dispara o lookup assíncrono (que retro-marca se for hosting).
  if (type === "pageview" && !isInternal) {
    if (cachedGeo) deps.bumpGeoViews(cachedGeo);
    else deps.lookupGeoAsync(ip);
  }

  deps.bumpHealth("received");
  deps.noteEvent();
  deps.pushEvent({
    type, path, title, category, articleId, sessionId, duration,
    device: detectDevice(input.ua),
    ts: now,
    ua: input.ua,
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
    if (type === "category" && category) deps.trackCategoryView(category);
    if (type === "pageview" && articleId && title) deps.trackArticleView(articleId, title);
  }

  return { body: { ok: true } };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ads/:id/impression  e  /click
// ─────────────────────────────────────────────────────────────────────────────
/** Chave de bloco "É uma propaganda" (contadores só em ad_daily_stats). */
export const BLOCK_PREFIX = "block:";

export interface AdEventDeps {
  overRateLimit(key: string, maxPerMinute: number): boolean;
  detectInternalRequest(bodyFlag: boolean, ip: string): { internal: boolean; reason: InternalReason | null };
  bumpEndpoint(ep: IngestEndpointId, key: keyof EndpointCounters): void;
  bumpInternalReason(reason: InternalReason): void;
  /** adImpDedup.hit / adClickDedup.hit — janela server-side do PRD 04 RF4. */
  dedupHit(key: string): boolean;
  /** Bloco da home/lateral marcado isAd; null = id desconhecido/não marcado. */
  findAdBlock(blockId: string): { visible: boolean } | null;
  /** SELECT do anúncio (o "db fake" injetável). undefined = não existe. */
  selectAd(id: string): Promise<{ active: boolean; expiresAt: Date | null } | undefined>;
  /** UPDATE +1 no all-time público de adsTable (só quando NÃO-interno). */
  incrementAdAllTime(id: string, field: "impressions" | "clicks"): Promise<void>;
  /** Upsert atômico no par (ad_id, date) — interno cai em internal_* (PRD 04). */
  upsertDailyStat(adId: string, field: "impressions" | "clicks", internal: boolean): Promise<void>;
}

export interface AdEventInput {
  adId: string;
  /** `req.ip ?? ""` cru: a rota original usa o CRU na chave de rate limit e o
   *  NORMALIZADO no dedup/detecção de interno — preservado aqui. */
  ipRaw: string;
  ua: string;
  body: Record<string, unknown>;
}

/** Contabiliza um evento de anúncio ACEITO (PRD 03 RF1): `received` sempre; se
 *  interno (PRD 04 RF3), soma `flaggedInternal` + a razão. Espelha o /event. */
function noteAdAccept(deps: AdEventDeps, ep: IngestEndpointId, det: { internal: boolean; reason: InternalReason | null }): void {
  deps.bumpEndpoint(ep, "received");
  if (det.internal && det.reason) { deps.bumpEndpoint(ep, "flaggedInternal"); deps.bumpInternalReason(det.reason); }
}

export async function handleImpression(deps: AdEventDeps, input: AdEventInput): Promise<HandlerResult> {
  const id = input.adId;
  if (isBotUa(input.ua)) { deps.bumpEndpoint("adImpression", "droppedBot"); return { body: { ok: true } }; }
  if (deps.overRateLimit(`adimp:${input.ipRaw}`, INGEST_RATE_LIMITS.adImpression)) {
    deps.bumpEndpoint("adImpression", "droppedRate"); return { body: { ok: true } };
  }

  const ip = normalizeIp(input.ipRaw);
  const sessionId = cleanStr(input.body["sessionId"], 100);
  const det = deps.detectInternalRequest(input.body["internal"] === true, ip);
  const internal = det.internal;

  // Dedup server-side (RF4): mesmo (sessão|ip, anúncio) em 30min = mesma visita.
  if (deps.dedupHit(`adimp:${id}:${sessionId ?? `ip:${ip}`}`)) {
    deps.bumpEndpoint("adImpression", "droppedDuplicate");
    return { body: { ok: true } };
  }

  // Bloco da home marcado "É uma propaganda" — só bloco visível conta.
  if (id.startsWith(BLOCK_PREFIX)) {
    const blk = deps.findAdBlock(id.slice(BLOCK_PREFIX.length));
    if (blk && blk.visible) {
      noteAdAccept(deps, "adImpression", det);
      void deps.upsertDailyStat(id, "impressions", internal);
    } else {
      deps.bumpEndpoint("adImpression", "droppedInvalid");
    }
    return { body: { ok: true } };
  }

  // Só anúncio ativo e não expirado gera impressão (clique já checava active).
  const row = await deps.selectAd(id);
  if (!row || !row.active || (row.expiresAt && row.expiresAt < new Date())) {
    deps.bumpEndpoint("adImpression", "droppedInvalid");
    return { body: { ok: true } };
  }

  // Interno (RF3) não incrementa o all-time público — só a coluna internal_*.
  if (!internal) { await deps.incrementAdAllTime(id, "impressions"); }
  noteAdAccept(deps, "adImpression", det);
  void deps.upsertDailyStat(id, "impressions", internal);

  return { body: { ok: true } };
}

export async function handleClick(deps: AdEventDeps, input: AdEventInput): Promise<HandlerResult> {
  const id = input.adId;
  // Bots e flood não viram métrica de cobrança — descarte silencioso, agora contado.
  if (isBotUa(input.ua)) { deps.bumpEndpoint("adClick", "droppedBot"); return { body: { ok: true } }; }
  if (deps.overRateLimit(`adclick:${input.ipRaw}`, INGEST_RATE_LIMITS.adClick)) {
    deps.bumpEndpoint("adClick", "droppedRate"); return { body: { ok: true } };
  }

  const ip = normalizeIp(input.ipRaw);
  const sessionId = cleanStr(input.body["sessionId"], 100);
  const det = deps.detectInternalRequest(input.body["internal"] === true, ip);
  const internal = det.internal;

  // Dedup server-side (RF4): mesmo (sessão|ip, anúncio) em 10s = duplo clique.
  if (deps.dedupHit(`adclick:${id}:${sessionId ?? `ip:${ip}`}`)) {
    deps.bumpEndpoint("adClick", "droppedDuplicate");
    return { body: { ok: true } };
  }

  // Bloco da home marcado "É uma propaganda" — só o histórico diário.
  if (id.startsWith(BLOCK_PREFIX)) {
    const blk = deps.findAdBlock(id.slice(BLOCK_PREFIX.length));
    if (!blk || !blk.visible) {
      deps.bumpEndpoint("adClick", "droppedInvalid");
      return { status: 404, body: { ok: false, error: "Ad not found or inactive" } };
    }
    noteAdAccept(deps, "adClick", det);
    void deps.upsertDailyStat(id, "clicks", internal);
    return { body: { ok: true, message: "Click tracked" } };
  }

  const row = await deps.selectAd(id);
  if (!row || !row.active) {
    deps.bumpEndpoint("adClick", "droppedInvalid");
    return { status: 404, body: { ok: false, error: "Ad not found or inactive" } };
  }

  // Interno (RF3) não incrementa o all-time público — só a coluna internal_*.
  if (!internal) { await deps.incrementAdAllTime(id, "clicks"); }
  noteAdAccept(deps, "adClick", det);
  void deps.upsertDailyStat(id, "clicks", internal);

  return { body: { ok: true, message: "Click tracked" } };
}
