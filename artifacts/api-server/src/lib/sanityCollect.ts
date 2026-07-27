/**
 * sanityCollect — coletor de insumos da malha de sanidade (PRD 11 RF2).
 *
 * Monta o SanityInput a partir do banco DO BLOG, REUSANDO as agregações do /stats
 * (resolvePeriod + buildWindowAggregates puros) para validar EXATAMENTE o que os
 * cards mostram — nunca uma reimplementação paralela da classificação de canal ou
 * da contagem de categoria. 100% LEITURA. Cada segmento tem try/catch próprio: uma
 * falha vira `skipped: db_error`, nunca derruba o monitor nem inventa um "ok" falso.
 *
 * NÃO é alvo de node --test (faz I/O). A lógica pura testável é evaluateSanity
 * (analyticsSanity.ts).
 */
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db, analyticsEventsTable, adDailyStatsTable, settingsTable } from "@workspace/db";
import { store } from "./store.js";
import { articleService } from "./articleService.js";
import {
  DAY, resolvePeriod, brtDayStartMs, buildWindowAggregates,
  compareTopCategories, PAID_RULE_SINCE,
  type EventLike, type PaidCampaign, type TopCategoryRow,
} from "./analyticsShared.js";
import { AD_SANITY_MARGIN, type SanityInput } from "./analyticsSanity.js";
import { logger } from "./logger.js";

export interface CollectResult {
  input: SanityInput;
  skipped: { rule: string; reason: string }[];
  window: { key: string; days: number };
}

/** Campanhas de tráfego pago ativas (mesma predicate de routes/analytics.ts
 *  activePaidCampaigns — PRD 05 RF3). Só o COUNT importa aqui (0 vs >0). */
function activePaidCampaignCount(): number {
  const arr = store.getSettings().paidCampaigns;
  if (!Array.isArray(arr)) return 0;
  return arr.filter((c): c is PaidCampaign =>
    !!c && typeof c === "object" && typeof c.id === "string" && c.active === true).length;
}

export async function collectSanityInput(nowMs: number = Date.now()): Promise<CollectResult> {
  const win = resolvePeriod({}, nowMs); // 30d BRT (default do dashboard)
  const winFrom = new Date(win.fromMs);
  const winTo = new Date(win.toMs);
  const skipped: { rule: string; reason: string }[] = [];

  // Defaults neutros (blog novo saudável) — sobrescritos por cada segmento.
  const input: SanityInput = {
    adDays: [],
    adMargin: AD_SANITY_MARGIN,
    paid: null,
    channelCounts: {},
    categoryViews: [],
    windowPageviewsNonInternal: 0,
    windowSessions: 0,
    windowUniqueVisitors: 0,
    displayedPercents: [],
  };

  // ── Segmento 1: agregação da janela (channelCounts, categoryViews, windowPv,
  //    windowSessions, displayedPercents) via buildWindowAggregates — MESMA função
  //    do /stats. Sem buffer (leitura só-SQL): simétrico p/ sessões e visitantes. ──
  let aggOk = false;
  let sessionCount = 0;
  try {
    const dbRows = await db.select({
      type: analyticsEventsTable.type, path: analyticsEventsTable.path,
      title: analyticsEventsTable.title, category: analyticsEventsTable.category,
      articleId: analyticsEventsTable.articleId, sessionId: analyticsEventsTable.sessionId,
      duration: analyticsEventsTable.duration, device: analyticsEventsTable.device,
      ts: analyticsEventsTable.ts, referrer: analyticsEventsTable.referrer,
      scrollDepth: analyticsEventsTable.scrollDepth, platform: analyticsEventsTable.platform,
      refHost: analyticsEventsTable.refHost, utmCampaign: analyticsEventsTable.utmCampaign,
      utmMedium: analyticsEventsTable.utmMedium, utmSource: analyticsEventsTable.utmSource,
    }).from(analyticsEventsTable).where(and(
      gte(analyticsEventsTable.ts, winFrom),
      lt(analyticsEventsTable.ts, winTo),
      eq(analyticsEventsTable.isInternal, false),
    ));
    const rows: EventLike[] = dbRows.map((r) => ({ ...r, ts: r.ts.getTime() }));
    const agg = buildWindowAggregates(rows, win);

    input.channelCounts = { ...agg.channelMap };
    input.categoryViews = Object.entries(agg.catViewMap).map(([slug, views]) => ({ slug, views }));
    input.windowPageviewsNonInternal = agg.windowPv;
    sessionCount = Object.keys(agg.sessionPageviews).length;
    input.windowSessions = sessionCount;

    // displayedPercents: reconstrói os % do jeito NAIVE do front pré-PRD-10 (base =
    // líder do array topCats[0]) para pegar na origem o estouro >100% que o PRD 10
    // corrige na exibição. Se o sort do PRD 06 regredir e o líder do array voltar a
    // ser categoria de 0 acesso, a base cai e outros chips passam de 100% → R7 dispara.
    const articleCountByCategory: Record<string, number> = {};
    try {
      const published = (await articleService.getArticles()).filter((a) => a.status === "published");
      for (const a of published) if (a.category) {
        articleCountByCategory[a.category] = (articleCountByCategory[a.category] ?? 0) + 1;
      }
    } catch { /* contagem de artigos best-effort: sem ela, articles=0 (não afeta o líder por acesso) */ }
    const catNames = new Set([
      ...Object.keys(agg.catViewMap), ...Object.keys(agg.catClickMap), ...Object.keys(articleCountByCategory),
    ]);
    const topCats: TopCategoryRow[] = Array.from(catNames).map((name) => ({
      name, views: agg.catViewMap[name] ?? 0, clicks: agg.catClickMap[name] ?? 0,
      articles: articleCountByCategory[name] ?? 0,
    })).sort(compareTopCategories).slice(0, 10);
    if (topCats.length > 0) {
      const lead = topCats[0]!;
      const base14 = ((lead.clicks || 0) + (lead.views || 0)) || 1; // item 14 (Analytics detalhado)
      const base3 = (lead.views || 0) || 1;                          // item 3 (Dashboard)
      const pcts: SanityInput["displayedPercents"] = [];
      for (const c of topCats) {
        pcts.push({ scope: `cat:${c.name}`, pct: (((c.clicks || 0) + (c.views || 0)) / base14) * 100 });
        pcts.push({ scope: `dash:${c.name}`, pct: ((c.views || 0) / base3) * 100 });
      }
      input.displayedPercents = pcts;
    }
    aggOk = true;
  } catch (err) {
    logger.warn({ err }, "sanityCollect: falha na agregação da janela");
    for (const r of ["sources_not_100", "category_gt_pageviews", "percent_over_100"]) {
      skipped.push({ rule: r, reason: "db_error" });
    }
  }

  // ── Segmento 2: visitantes únicos (SQL puro, sem buffer) — para R5 ──
  let visitorsOk = false;
  try {
    const r = await db.execute(sql`
      SELECT count(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::int AS uniq
      FROM analytics_events
      WHERE type = 'pageview' AND is_internal = false
        AND ts >= ${winFrom} AND ts < ${winTo}
    `);
    input.windowUniqueVisitors = ((r.rows?.[0] ?? {}) as { uniq?: number }).uniq ?? 0;
    visitorsOk = true;
  } catch (err) {
    logger.warn({ err }, "sanityCollect: falha em visitantes únicos");
  }
  // R5 exige AMBOS os lados (sessões da agregação + visitantes) — senão skip db_error.
  if (!aggOk || !visitorsOk) skipped.push({ rule: "sessions_lt_visitors", reason: "db_error" });

  // ── Segmento 3: adDays (R1/R6) — só datas >= ads_reliable_since (PRD 04) ──
  let adsReliableSince: string | null = null;
  try {
    const [row] = await db.select({ value: settingsTable.value })
      .from(settingsTable).where(eq(settingsTable.key, "ads_reliable_since")).limit(1);
    adsReliableSince = row?.value ?? null;
  } catch { /* baixo tráfego; tratado como reparo pendente abaixo */ }

  if (adsReliableSince == null) {
    for (const r of ["clicks_gt_impressions", "impressions_gt_pageviews"]) {
      skipped.push({ rule: r, reason: "prd04_reparo_pendente" });
    }
  } else {
    try {
      const fromDay = win.fromDay > adsReliableSince ? win.fromDay : adsReliableSince;
      const [adRes, pvRes] = await Promise.all([
        db.select({
          adId: adDailyStatsTable.adId, date: adDailyStatsTable.date,
          impressions: adDailyStatsTable.impressions, clicks: adDailyStatsTable.clicks,
        }).from(adDailyStatsTable).where(and(
          gte(adDailyStatsTable.date, fromDay),
          lte(adDailyStatsTable.date, win.toDay),
        )),
        db.execute(sql`
          SELECT (ts AT TIME ZONE 'America/Sao_Paulo')::date::text AS day, count(*)::int AS pageviews
          FROM analytics_events
          WHERE type = 'pageview' AND is_internal = false
            AND ts >= ${winFrom} AND ts < ${winTo}
          GROUP BY 1
        `),
      ]);
      const pvMap = new Map<string, number>();
      for (const p of (pvRes.rows ?? []) as { day?: string; pageviews?: number }[]) {
        if (p.day) pvMap.set(p.day, p.pageviews ?? 0);
      }
      input.adDays = adRes.map((a) => ({
        adId: a.adId, date: a.date, impressions: a.impressions, clicks: a.clicks,
        pageviews: pvMap.get(a.date) ?? 0, slots: 1, // S(A)=1 pós-dedup do PRD 04
      }));
    } catch (err) {
      logger.warn({ err }, "sanityCollect: falha em adDays");
      input.adDays = [];
      for (const r of ["clicks_gt_impressions", "impressions_gt_pageviews"]) {
        skipped.push({ rule: r, reason: "db_error" });
      }
    }
  }

  // ── Segmento 4: paid (R2) — campanhas ativas + linhas 'pago' pós-corte ──
  try {
    const cutoff = new Date(brtDayStartMs(PAID_RULE_SINCE));
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM analytics_events
      WHERE referrer = 'pago' AND ts >= ${cutoff}
    `);
    const n = ((r.rows?.[0] ?? {}) as { n?: number }).n ?? 0;
    input.paid = { activeCampaigns: activePaidCampaignCount(), paidLinesSinceRule: n };
  } catch (err) {
    logger.warn({ err }, "sanityCollect: falha em paid");
    input.paid = null;
    skipped.push({ rule: "paid_without_campaign", reason: "db_error" });
  }

  return { input, skipped, window: { key: win.key, days: win.days } };
}
