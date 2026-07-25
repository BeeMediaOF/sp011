/**
 * analyticsShared — lógica pura do pipeline de analytics (zero imports).
 *
 * Tudo aqui é função determinística sobre valores simples: é o alvo direto dos
 * testes `node --test` (que importam este arquivo com extensão .ts explícita).
 * Nada de Express, Drizzle ou I/O — isso fica em routes/analytics.ts.
 */

// ─── Fuso de exibição ─────────────────────────────────────────────────────────
// America/Sao_Paulo é UTC-3 fixo (o horário de verão foi abolido em 2019).
// Todo o bucketing por dia/hora usa o relógio de Brasília, não o do container.
export const BRT_OFFSET_MS = 3 * 3_600_000;
export const DAY = 86_400_000;
export const brtDayKey = (tsMs: number): string => new Date(tsMs - BRT_OFFSET_MS).toISOString().slice(0, 10);
export const brtHour   = (tsMs: number): number => new Date(tsMs - BRT_OFFSET_MS).getUTCHours();
export const brtDow    = (tsMs: number): number => new Date(tsMs - BRT_OFFSET_MS).getUTCDay();
/** Início (epoch ms) do dia BRT `YYYY-MM-DD` — inverso de brtDayKey. */
export const brtDayStartMs = (dayKey: string): number => Date.parse(`${dayKey}T00:00:00Z`) + BRT_OFFSET_MS;

/** Dados coletados com as regras da rodada 2 (visitante/UTM/interno) valem a partir daqui. */
export const ANALYTICS_V2_SINCE = "2026-07-08";

/** Corte da regra de "pago exige campanha" (PRD 05 RF-5): linhas `referrer='pago'`
 *  a partir deste dia BRT foram validadas por campanha no ingest e são confiadas na
 *  leitura; ANTES dele são legado (fbclid/gclid órfão) e sofrem remap na agregação.
 *  DEVE ser >= o dia do rollout (dia SEGUINTE ao deploy é o conservador — todas as
 *  linhas do próprio dia do deploy, escritas em parte pelo código antigo, caem no
 *  remap). Se o rollout escorregar de dia, ATUALIZAR antes do build. */
export const PAID_RULE_SINCE = "2026-07-25";

// ─── Validação de entrada ─────────────────────────────────────────────────────
// O endpoint é público: tudo que chega é hostil até prova em contrário. Um único
// valor fora do enum do Postgres faria o INSERT em lote falhar e travaria o
// buffer inteiro — por isso whitelist + clamps antes de enfileirar.
export const VALID_TYPES: ReadonlySet<string> = new Set(["pageview", "read", "category", "scroll", "share"]);
/** Tipos de behavior_events (POST /api/analytics/behavior). Fonte única — o handler
 *  importa daqui. video_play/download: RESERVADOS (sem emissor no client; linha
 *  existente = anomalia — ver docs/ANALYTICS.md, Taxonomia). Valores são
 *  persistidos: nunca renomear. */
export const BEHAVIOR_TYPES: ReadonlySet<string> = new Set([
  "search", "link_click", "newsletter", "video_play", "download",
]);
export const SCROLL_MILESTONES: ReadonlySet<number> = new Set([25, 50, 75, 100]);
/** Teto de duração de leitura — aba esquecida aberta não pode distorcer a média. */
export const MAX_READ_SECONDS = 1800;

export function cleanStr(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;
}

export function normalizeIp(raw: string): string {
  return raw.replace(/^::ffff:/i, "");
}

export function isPrivateIp(raw: string): boolean {
  const ip = normalizeIp(raw);
  return (
    ip === "" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

/** Lista de IPs internos configurada no painel (texto livre: vírgula/espaço/linha). */
export function parseInternalIps(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(/[\s,;]+/).map((s) => normalizeIp(s.trim())).filter((s) => s.length > 0);
}

// ─── Detecção de tráfego interno (PRD 03 RF4 — tripla canônica) ───────────────
export type InternalReason = "flag" | "configuredIp" | "privateIp";

/**
 * Tripla canônica de detecção de tráfego interno (mesma semântica do /event).
 * Precedência de ATRIBUIÇÃO de razão: flag > configuredIp > privateIp (o resultado
 * booleano independe da ordem). Puro — o chamador injeta o Set de IPs configurados
 * (memoizado em internalTraffic.ts). `configured` já vem normalizado (parseInternalIps),
 * simétrico ao `ip` normalizado (normalizeIp) — sem assimetria ::ffff:.
 */
export function detectInternal(
  flag: boolean, ip: string, configured: ReadonlySet<string>,
): { internal: boolean; reason: InternalReason | null } {
  if (flag) return { internal: true, reason: "flag" };
  if (configured.has(ip)) return { internal: true, reason: "configuredIp" };
  if (isPrivateIp(ip)) return { internal: true, reason: "privateIp" };
  return { internal: false, reason: null };
}

// ─── Dispositivo / navegador / SO (parse próprio, sem dependência) ────────────
export function detectDevice(ua: string): "mobile" | "desktop" | "tablet" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Famílias de navegador/SO a partir do user-agent. A ordem importa: Edge/Opera/
 * Samsung embutem "chrome" no UA; Chrome embute "safari"; iOS usa CriOS/FxiOS.
 * Fora do catálogo vira "outro" — nunca inventamos valor.
 */
export function parseUa(ua: string): { browser: string; os: string } {
  const s = ua.toLowerCase();
  if (!s) return { browser: "outro", os: "outro" };

  let browser = "outro";
  if (/edg(e|a|ios)?\//.test(s))            browser = "edge";
  else if (s.includes("opr/") || s.includes("opera")) browser = "opera";
  else if (s.includes("samsungbrowser"))    browser = "samsung";
  else if (s.includes("firefox/") || s.includes("fxios")) browser = "firefox";
  else if (s.includes("chrome/") || s.includes("crios")) browser = "chrome";
  else if (s.includes("safari/") && s.includes("version/")) browser = "safari";
  else if (s.includes("msie") || s.includes("trident")) browser = "ie";

  let os = "outro";
  if (s.includes("windows"))                os = "windows";
  else if (s.includes("android"))           os = "android";
  else if (/iphone|ipad|ipod/.test(s))      os = "ios";
  else if (s.includes("mac os"))            os = "macos";
  else if (s.includes("cros"))              os = "chromeos";
  else if (s.includes("linux"))             os = "linux";

  return { browser, os };
}

// ─── Classificação de canal de origem ─────────────────────────────────────────
/** Canais oficiais. "interno" só aparece em eventos marcados is_internal
 *  (excluídos das agregações públicas); "outro" é legado → vira "referencia". */
export const CHANNELS = ["direto", "busca", "social", "referencia", "email", "pago", "interno", "desconhecido"] as const;
export type Channel = (typeof CHANNELS)[number];

const SEARCH_HOST_RE =
  /(^|\.)((google|bing|yahoo|duckduckgo|baidu|ecosia|startpage|qwant)\.[a-z.]+|search\.brave\.com)$/;
const SOCIAL_HOST_RE =
  /(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|instagram\.com|twitter\.com|x\.com|t\.co|whatsapp\.com|wa\.me|t\.me|telegram\.(org|me)|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.[a-z.]+|threads\.net|reddit\.com|bsky\.app)$/;
const MAIL_HOST_RE =
  /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$|^webmail\./;

/** utm_source de rede social conhecida (para o remap do legado — PRD 05 RF-5). */
const SOCIAL_SOURCE_RE = /^(facebook|fb|instagram|ig|meta|twitter|x|tiktok|youtube|linkedin|threads|whatsapp|wa|telegram|reddit|pinterest)$/;

export interface ChannelSignals {
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  utmCampaign?: string | undefined;   // casa com PaidCampaign.utmCampaign (PRD 05)
  paidClick?: boolean | undefined;    // legado: gclid OU fbclid fundidos (bundle antigo)
  gclid?: boolean | undefined;        // presença de gclid na URL (Google) — só booleano
  fbclid?: boolean | undefined;       // presença de fbclid na URL (Meta) — só booleano
  refHost?: string | undefined;       // hostname cru do document.referrer
  legacyChannel?: string | undefined; // bundle antigo do cliente: direto|busca|social|outro
}

/** Campanha de tráfego pago cadastrada pelo operador (settings, por blog) — PRD 05 RF-1.
 *  "pago" só existe quando uma campanha ativa casa os sinais da visita. */
export interface PaidCampaign {
  id: string;
  name: string;
  active: boolean;
  utmCampaign?: string;   // casa com lower(trim(utm_campaign)) da visita
  utmSource?: string;     // casam JUNTOS (par) com utm_source + utm_medium
  utmMedium?: string;
  acceptGclid?: boolean;  // cliques com gclid pertencem a esta campanha (Google Ads)
  acceptFbclid?: boolean; // cliques com fbclid pertencem a esta campanha (Meta Ads)
  startDay?: string;      // "YYYY-MM-DD" (dia BRT, inclusivo) — opcional
  endDay?: string;        // "YYYY-MM-DD" (dia BRT, inclusivo) — opcional
}

/**
 * Uma campanha CASA a visita (PRD 05 RF-1) se estiver ativa, dentro da janela de
 * datas BRT (extremos inclusivos; datas inválidas/ausentes = sem limite) e QUALQUER
 * um dos identificadores DEFINIDOS casar: (a) utm_campaign igual; (b) utm_source E
 * utm_medium (par) iguais; (c) acceptGclid + gclid presente; (d) acceptFbclid +
 * fbclid presente. Campanha SEM identificador nunca casa nada. `todayKey` (dia BRT)
 * é injetado — a função é pura/determinística (o ingest passa brtDayKey(Date.now())).
 */
export function matchesPaidCampaign(sig: ChannelSignals, c: PaidCampaign, todayKey: string): boolean {
  if (!c.active) return false;
  if (c.startDay && isDayKey(c.startDay) && todayKey < c.startDay) return false;
  if (c.endDay && isDayKey(c.endDay) && todayKey > c.endDay) return false;

  const sigC = (sig.utmCampaign ?? "").toLowerCase().trim();
  const sigS = (sig.utmSource ?? "").toLowerCase().trim();
  const sigM = (sig.utmMedium ?? "").toLowerCase().trim();
  const campC = (c.utmCampaign ?? "").toLowerCase().trim();
  const campS = (c.utmSource ?? "").toLowerCase().trim();
  const campM = (c.utmMedium ?? "").toLowerCase().trim();

  if (campC && sigC && sigC === campC) return true;
  if (campS && campM && sigS === campS && sigM === campM) return true;
  if (c.acceptGclid && sig.gclid) return true;
  if (c.acceptFbclid && sig.fbclid) return true;
  return false;
}

/**
 * Precedência (PRD 05 RF-2): pago (SÓ via campanha ativa) → email → medium explícito
 * → host → click-id sem host (fbclid→social, gclid→busca) → medium/source/paidClick
 * legado = desconhecido → canal legado → direto. `gclid`/`fbclid` NÃO são mais
 * gatilhos autônomos de "pago" — só a mera presença de campanha casando. O servidor
 * é o único que classifica; o cliente envia apenas sinais crus.
 */
export function classifyChannel(
  sig: ChannelSignals,
  campaigns: PaidCampaign[] = [],
  todayKey: string = brtDayKey(Date.now()),
): Channel {
  const medium = (sig.utmMedium ?? "").toLowerCase().trim();
  const source = (sig.utmSource ?? "").toLowerCase().trim();
  const host   = (sig.refHost ?? "").toLowerCase().trim();

  // 1. pago SÓ quando uma campanha ativa cadastrada casa os sinais (única porta).
  for (const c of campaigns) if (matchesPaidCampaign(sig, c, todayKey)) return "pago";

  if (/^(email|e-mail|newsletter)$/.test(medium) || MAIL_HOST_RE.test(host)) return "email";
  if (/^(social|sm)$/.test(medium)) return "social";
  if (/^(organic|search)$/.test(medium)) return "busca";
  if (host) {
    if (SEARCH_HOST_RE.test(host)) return "busca";
    if (SOCIAL_HOST_RE.test(host)) return "social";
    return "referencia";
  }
  // click-id sem host (in-app browser do Meta/Google não manda referrer): determinístico.
  if (sig.fbclid) return "social";
  if (sig.gclid)  return "busca";
  // paidClick legado (bundle antigo, plataforma indistinguível) ou UTM irreconhecível.
  if (medium || source || sig.paidClick) return "desconhecido";

  const legacy = sig.legacyChannel;
  if (legacy === "direto" || legacy === "busca" || legacy === "social") return legacy;
  if (legacy === "outro") return "referencia";
  return "direto";
}

/** Remap SÓ na agregação — linhas históricas nunca são reescritas no banco. */
export function normalizeLegacyChannel(v: string): Channel {
  if (v === "outro") return "referencia";
  return (CHANNELS as readonly string[]).includes(v) ? (v as Channel) : "desconhecido";
}

/**
 * Canal de uma linha PERSISTIDA, na leitura (PRD 05 RF-5). Estende o precedente do
 * `normalizeLegacyChannel` (nenhum UPDATE no banco — invariante §17). Só o canal
 * `"pago"` recebe tratamento especial:
 *   - `ts >= PAID_RULE_SINCE` → mantém `"pago"` (já validado por campanha no ingest);
 *   - `ts < PAID_RULE_SINCE` (legado, fbclid/gclid órfão) → reconstrói o canal
 *     NÃO-pago pelos sinais persistidos, UTM ANTES do host (§9.2: há linha social
 *     legada com `utm_medium=social` e `ref_host` NULO — a automação social da rede).
 * Demais canais delegam a `normalizeLegacyChannel`.
 */
export function resolveStoredChannel(
  referrer: string,
  tsMs: number,
  refHost?: string,
  utmMedium?: string,
  utmSource?: string,
): Channel {
  if (referrer !== "pago") return normalizeLegacyChannel(referrer);
  if (tsMs >= brtDayStartMs(PAID_RULE_SINCE)) return "pago";

  const medium = (utmMedium ?? "").toLowerCase().trim();
  const source = (utmSource ?? "").toLowerCase().trim();
  const host   = (refHost ?? "").toLowerCase().trim();

  // 1. UTM social (medium=social OU source de rede social conhecida) — antes do host.
  if (/^(social|sm)$/.test(medium) || SOCIAL_SOURCE_RE.test(source)) return "social";
  // 2. UTM e-mail.
  if (/^(email|e-mail|newsletter)$/.test(medium)) return "email";
  // 3. Fallback por host.
  if (host) {
    if (MAIL_HOST_RE.test(host)) return "email";
    if (SEARCH_HOST_RE.test(host)) return "busca";
    if (SOCIAL_HOST_RE.test(host)) return "social";
    return "referencia";
  }
  // 4. Sem UTM útil e sem host — gclid/fbclid indistinguíveis no legado (c7).
  return "desconhecido";
}

// ─── Janela de período (dias BRT, `to` inclusivo) ─────────────────────────────
export interface PeriodWindow {
  key: "today" | "yesterday" | "7d" | "30d" | "custom";
  fromMs: number;     // início do 1º dia BRT (inclusivo)
  toMs: number;       // início do dia BRT seguinte ao último (exclusivo)
  prevFromMs: number; // janela imediatamente anterior, de mesmo tamanho
  prevToMs: number;
  days: number;
  label: string;
  fromDay: string;    // YYYY-MM-DD BRT (para filtrar ad_daily_stats.date)
  toDay: string;      // inclusivo
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Round-trip obrigatório: alguns parsers aceitam "2026-02-31" com rollover
// para março em vez de rejeitar — comparar a re-serialização pega isso.
const isDayKey = (s: string): boolean => {
  if (!DAY_KEY_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const fmtBr = (dayKey: string): string => `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}/${dayKey.slice(0, 4)}`;

/**
 * Resolve `?period=&from=&to=` numa janela fechada de dias BRT. Entrada
 * inválida NUNCA erra: cai no padrão de 30 dias e o `key` ecoado na resposta
 * mostra o que foi de fato aplicado. Custom limitado a 366 dias e ao dia atual.
 */
export function resolvePeriod(q: { period?: unknown; from?: unknown; to?: unknown }, nowMs: number): PeriodWindow {
  const todayKey = brtDayKey(nowMs);
  const p = typeof q.period === "string" ? q.period : "";

  let key: PeriodWindow["key"] = "30d";
  let fromDay = brtDayKey(nowMs - 29 * DAY);
  let toDay = todayKey;
  let label = "Últimos 30 dias";

  if (p === "today") {
    key = "today"; fromDay = todayKey; toDay = todayKey; label = "Hoje";
  } else if (p === "yesterday") {
    key = "yesterday"; fromDay = brtDayKey(nowMs - DAY); toDay = fromDay; label = "Ontem";
  } else if (p === "7d") {
    key = "7d"; fromDay = brtDayKey(nowMs - 6 * DAY); label = "Últimos 7 dias";
  } else if (p === "custom") {
    const from = typeof q.from === "string" ? q.from : "";
    const to   = typeof q.to === "string" ? q.to : "";
    if (isDayKey(from) && isDayKey(to) && from <= to && from <= todayKey) {
      key = "custom";
      fromDay = from;
      toDay = to > todayKey ? todayKey : to; // futuro não existe no relatório
      // Clamp de 366 dias — período gigante viraria full scan sem valor analítico.
      if (brtDayStartMs(toDay) - brtDayStartMs(fromDay) > 365 * DAY) {
        fromDay = brtDayKey(brtDayStartMs(toDay) - 365 * DAY + BRT_OFFSET_MS);
      }
      label = `${fmtBr(fromDay)} a ${fmtBr(toDay)}`;
    }
  }

  const fromMs = brtDayStartMs(fromDay);
  const toMs = brtDayStartMs(toDay) + DAY;
  const len = toMs - fromMs;
  return {
    key, fromMs, toMs,
    prevFromMs: fromMs - len,
    prevToMs: fromMs,
    days: Math.round(len / DAY),
    label, fromDay, toDay,
  };
}

// ─── Reducer de agregação da janela ───────────────────────────────────────────
export interface EventLike {
  type: string;
  path?: string | null;
  title?: string | null;
  category?: string | null;
  articleId?: string | null;
  sessionId: string;
  duration?: number | null;
  device?: string | null;
  ts: number; // epoch ms — o chamador converte Date antes
  referrer?: string | null;
  scrollDepth?: number | null;
  platform?: string | null;
  refHost?: string | null;
  utmCampaign?: string | null;
  utmMedium?: string | null;   // PRD 05 RF-5: remap do canal 'pago' legado
  utmSource?: string | null;
}

export interface WindowAggregates {
  byDay: Record<string, number>;
  byHour: number[];
  byDow: number[];
  deviceMap: Record<string, number>;
  channelMap: Record<string, number>;
  shareMap: Record<string, number>;
  /** Sessões únicas que atingiram cada marco (dedup real de scroll). */
  scrollSessions: Record<number, Set<string>>;
  articleMap: Record<string, { title: string; views: number }>;
  catViewMap: Record<string, number>;
  catClickMap: Record<string, number>;
  sessionPageviews: Record<string, number>;
  /** MAX(duration) por sessão+página — heartbeats cumulativos são idempotentes. */
  readMax: Map<string, number>;
  /** MAX(duration) por artigo+sessão, para o tempo médio por artigo. */
  articleReadMax: Map<string, number>;
  refHostMap: Record<string, number>;
  campaignMap: Record<string, number>;
  windowPv: number;
}

/**
 * Um passe sobre os eventos da janela (linhas do banco + buffer em memória).
 * Espera receber SÓ eventos não-internos dentro de [fromMs, toMs) — ainda assim
 * descarta o que estiver fora, por defesa.
 */
export function buildWindowAggregates(rows: EventLike[], win: { fromMs: number; toMs: number }): WindowAggregates {
  const byDay: Record<string, number> = {};
  for (let t = win.fromMs; t < win.toMs; t += DAY) byDay[brtDayKey(t)] = 0;

  const byHour: number[] = Array(24).fill(0);
  const byDow: number[]  = Array(7).fill(0);
  const deviceMap: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };
  const channelMap: Record<string, number> = {
    direto: 0, busca: 0, social: 0, referencia: 0, email: 0, pago: 0, desconhecido: 0,
  };
  const shareMap: Record<string, number> = {};
  const scrollSessions: Record<number, Set<string>> = { 25: new Set(), 50: new Set(), 75: new Set(), 100: new Set() };
  const articleMap: WindowAggregates["articleMap"] = {};
  const catViewMap: Record<string, number> = {};
  const catClickMap: Record<string, number> = {};
  const sessionPageviews: Record<string, number> = {};
  const readMax = new Map<string, number>();
  const articleReadMax = new Map<string, number>();
  const refHostMap: Record<string, number> = {};
  const campaignMap: Record<string, number> = {};
  let windowPv = 0;

  for (const ev of rows) {
    if (ev.ts < win.fromMs || ev.ts >= win.toMs) continue;

    if (ev.type === "pageview") {
      windowPv++;
      const dayKey = brtDayKey(ev.ts);
      if (byDay[dayKey] !== undefined) byDay[dayKey]++;
      byHour[brtHour(ev.ts)]++;
      byDow[brtDow(ev.ts)]++;
      if (ev.device) deviceMap[ev.device] = (deviceMap[ev.device] ?? 0) + 1;

      // Origem é atribuída por sessão: só o pageview de entrada carrega canal.
      // PRD 05 RF-5: 'pago' legado (< PAID_RULE_SINCE) é remapeado pelos sinais
      // persistidos; nenhuma linha é reescrita no banco.
      if (ev.referrer) {
        const ch = resolveStoredChannel(
          ev.referrer, ev.ts, ev.refHost ?? undefined, ev.utmMedium ?? undefined, ev.utmSource ?? undefined,
        );
        if (ch !== "interno") channelMap[ch] = (channelMap[ch] ?? 0) + 1;
      }
      if (ev.refHost) refHostMap[ev.refHost] = (refHostMap[ev.refHost] ?? 0) + 1;
      if (ev.utmCampaign) campaignMap[ev.utmCampaign] = (campaignMap[ev.utmCampaign] ?? 0) + 1;

      sessionPageviews[ev.sessionId] = (sessionPageviews[ev.sessionId] ?? 0) + 1;

      if (ev.articleId) {
        const a = articleMap[ev.articleId] ?? (articleMap[ev.articleId] = { title: ev.title ?? ev.articleId, views: 0 });
        a.views++;
        if (!a.title && ev.title) a.title = ev.title;
      }
      if (ev.category) catViewMap[ev.category] = (catViewMap[ev.category] ?? 0) + 1;
    }

    if (ev.type === "category" && ev.category) {
      catClickMap[ev.category] = (catClickMap[ev.category] ?? 0) + 1;
    }

    if (ev.type === "read" && ev.duration && ev.duration > 0) {
      const dur = Math.min(ev.duration, MAX_READ_SECONDS);
      const pageKey = `${ev.sessionId}|${ev.path ?? ev.articleId ?? ""}`;
      if ((readMax.get(pageKey) ?? 0) < dur) readMax.set(pageKey, dur);
      if (ev.articleId) {
        const aKey = `${ev.articleId}|${ev.sessionId}`;
        if ((articleReadMax.get(aKey) ?? 0) < dur) articleReadMax.set(aKey, dur);
      }
    }

    if (ev.type === "scroll" && ev.scrollDepth) {
      // PRD 06 RF-4: chave IDÊNTICA à do read (path-first) — o mesmo marco chegando
      // uma vez só com path (durante o load do artigo) e outra com articleId colapsa
      // numa chave só; sem isso o par sessão×conteúdo contaria 2x.
      scrollSessions[ev.scrollDepth]?.add(`${ev.sessionId}|${ev.path ?? ev.articleId ?? ""}`);
    }

    if (ev.type === "share" && ev.platform) {
      shareMap[ev.platform] = (shareMap[ev.platform] ?? 0) + 1;
    }
  }

  return {
    byDay, byHour, byDow, deviceMap, channelMap, shareMap, scrollSessions,
    articleMap, catViewMap, catClickMap, sessionPageviews, readMax,
    articleReadMax, refHostMap, campaignMap, windowPv,
  };
}

/** Variação % (1 casa) — null quando não há base de comparação (nunca inventa 0%). */
export function pctChange(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
}

// ─── Top categorias / dia da semana (PRD 06 — ordenação e pico corretos) ──────
export interface TopCategoryRow { name: string; views: number; clicks: number; articles: number; }

/**
 * PRD 06 RF-1: ordenação do "Top categorias" (card "por acessos"). Chave primária
 * = acessos (clicks+views) DESC; desempate por nº de artigos DESC; desempate final
 * por nome ASC (estável/determinística entre requests). Categoria com acessos > 0
 * NUNCA fica abaixo de categoria com 0 acessos — o `|| articles` do sort antigo
 * deixava categoria sem nenhum acesso liderar por ter muitos artigos.
 */
export function compareTopCategories(a: TopCategoryRow, b: TopCategoryRow): number {
  const accA = a.clicks + a.views;
  const accB = b.clicks + b.views;
  if (accB !== accA) return accB - accA;
  if (b.articles !== a.articles) return b.articles - a.articles;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * PRD 06 RF-3: quantas vezes cada dia da semana (0=Dom..6=Sáb, BRT) ocorre na
 * janela [fromMs, toMs) — mesmo passo do zero-init de byDay (DAY a partir de fromMs,
 * que já é início de dia BRT). Numa janela de 30 dias, 2 dias ocorrem 5x e 5 ocorrem
 * 4x: sem normalizar por isso, o "pico por dia da semana" tem viés estrutural de até
 * ~25% independente dos dados.
 */
export function dowOccurrences(win: { fromMs: number; toMs: number }): number[] {
  const occ: number[] = Array(7).fill(0);
  for (let t = win.fromMs; t < win.toMs; t += DAY) occ[brtDow(t)]!++;
  return occ;
}

/**
 * PRD 06 RF-3: dia da semana de maior MÉDIA (views/ocorrência), entre os dias com
 * ocorrência > 0 e views > 0. Empate de média → maior soma bruta; empate persistindo
 * → menor índice (varredura ascendente + substituição só estrita). Sem dia com
 * views > 0 → null (preserva o contrato peakDay:null).
 */
export function pickPeakDow(byDow: number[], occ: number[]): number | null {
  let best: number | null = null;
  let bestAvg = -1;
  let bestSum = -1;
  for (let d = 0; d < 7; d++) {
    const views = byDow[d] ?? 0;
    const o = occ[d] ?? 0;
    if (o <= 0 || views <= 0) continue;
    const avg = views / o;
    if (avg > bestAvg || (avg === bestAvg && views > bestSum)) {
      best = d; bestAvg = avg; bestSum = views;
    }
  }
  return best;
}

// ─── Reconciliação do buffer (PRD 03 RF6 — puro, testável) ────────────────────
/**
 * Quando o flush falha inteiro (banco fora), quantos eventos cabem de volta no
 * buffer e quantos são descartados por falta de espaço. `discard + requeue`
 * SEMPRE = `failedLen` (fecha a identidade received = flushedOk + flushFailed +
 * buffered do card Saúde).
 */
export function planRequeue(failedLen: number, bufferLen: number, max: number): { requeue: number; discard: number } {
  const room = Math.max(0, max - bufferLen);
  const requeue = Math.min(failedLen, room);
  return { requeue, discard: failedLen - requeue };
}

/** Excedente a descartar quando o buffer passa do teto duro (nunca negativo). */
export function capExcess(len: number, cap: number): number {
  return Math.max(0, len - cap);
}

// ─── Sanidade de anúncios (PRD 04 RF6 — fórmula/fonte; motor contínuo é o PRD 11) ─
export interface SanityResult {
  ok: boolean;
  ratio: number; // impressões / limite (>1 = estouro)
  limit: number;
}

/**
 * `impressoes_publicas(A,D) ≤ max(pageviews_nao_internos(D),1) × slots × margem`.
 * Piso `max(pv,1)`: um dia com 0 pageview ainda admite algumas impressões — impressão
 * NÃO passa por gate LGPD e pageview passa, então há tráfego que gera impressão sem
 * pageview (assimetria confirmada com dados, auditoria §9.3). NÃO remover o piso nem
 * inflar a margem para "zerar" alerta: seria esconder o achado. Margem = 3 enquanto a
 * assimetria existir (severidade warning), 1.5 depois que o PRD 02 alinhar a admissão.
 */
export function checkAdSanity(
  impressions: number,
  pageviews: number,
  slots: number,
  margin: number,
): SanityResult {
  const limit = Math.max(pageviews, 1) * slots * margin;
  return { ok: impressions <= limit, ratio: limit > 0 ? impressions / limit : 0, limit };
}

/**
 * Regra irmã (PRD 04 RF6): `clicks_publicos(A,D) ≤ impressoes_publicas(A,D) + 1`.
 * O `+1` é folga TEÓRICA para o clique legítimo antes do dwell de 1s (nenhum caso
 * empírico na rede — os candidatos eram artefato da inflação, §9.6). Apertar para `≤`
 * estrito é decisão do PRD 11 após o reparo — não neste PRD.
 */
export function checkClicksVsImpressions(
  clicks: number,
  impressions: number,
): { ok: boolean; limit: number } {
  const limit = impressions + 1;
  return { ok: clicks <= limit, limit };
}
