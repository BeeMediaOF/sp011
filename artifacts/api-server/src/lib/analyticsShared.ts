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

export interface ChannelSignals {
  utmSource?: string | undefined;
  utmMedium?: string | undefined;
  paidClick?: boolean | undefined;    // gclid/fbclid presente na URL de entrada
  refHost?: string | undefined;       // hostname cru do document.referrer
  legacyChannel?: string | undefined; // bundle antigo do cliente: direto|busca|social|outro
}

/**
 * Precedência: pago → email → medium explícito → host de busca → host social →
 * qualquer host externo = referência → UTM irreconhecível = desconhecido →
 * canal legado → direto. O servidor é o único que classifica; o cliente envia
 * apenas sinais crus.
 */
export function classifyChannel(sig: ChannelSignals): Channel {
  const medium = (sig.utmMedium ?? "").toLowerCase().trim();
  const source = (sig.utmSource ?? "").toLowerCase().trim();
  const host   = (sig.refHost ?? "").toLowerCase().trim();

  if (sig.paidClick || /^(cpc|ppc|paid|display|cpm|banner|retargeting)$/.test(medium)) return "pago";
  if (/^(email|e-mail|newsletter)$/.test(medium) || MAIL_HOST_RE.test(host)) return "email";
  if (/^(social|sm)$/.test(medium)) return "social";
  if (/^(organic|search)$/.test(medium)) return "busca";
  if (host) {
    if (SEARCH_HOST_RE.test(host)) return "busca";
    if (SOCIAL_HOST_RE.test(host)) return "social";
    return "referencia";
  }
  if (medium || source) return "desconhecido";

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
      if (ev.referrer) {
        const ch = normalizeLegacyChannel(ev.referrer);
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
      scrollSessions[ev.scrollDepth]?.add(`${ev.sessionId}|${ev.articleId ?? ev.path ?? ""}`);
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
