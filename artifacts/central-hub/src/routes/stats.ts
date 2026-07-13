import { Router } from "express";
import {
  db,
  blogsTable,
  deliveriesTable,
  deliveryAttemptsTable,
  newsItemsTable,
  rewritesTable,
  aiUsageEventsTable,
  centralEventLogsTable,
} from "@workspace/central-db";
import { desc, gte, sql } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

/** Dia operacional do painel — agregações sempre no fuso de Brasília. */
const TZ = "America/Sao_Paulo";

/** Expressão SQL: dia (YYYY-MM-DD) de um timestamptz no fuso do painel. */
const spDay = (col: unknown) =>
  sql<string>`((${col} at time zone 'America/Sao_Paulo')::date)::text`;

/** Expressão SQL: instante da meia-noite de hoje (fuso do painel) menos N dias. */
const spSince = (days: number) =>
  sql`((date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') - make_interval(days => ${sql.raw(String(Math.floor(days)))}))`;

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const dayKey = (d: Date) => dayKeyFmt.format(d);

/**
 * Custo estimado por provedor em US$ por 1M de tokens (aproximação para o
 * dashboard — preços de tabela dos modelos "flash/mini"; Ollama é local = 0).
 */
const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  gemini: { in: 0.10, out: 0.40 },
  openai: { in: 0.15, out: 0.60 },
  perplexity: { in: 1.00, out: 1.00 },
  ollama: { in: 0, out: 0 },
};

function estimateCostUsd(provider: string, inTok: number, outTok: number, totalTok: number): number {
  const p = PRICE_PER_M[provider.toLowerCase()] ?? { in: 0.15, out: 0.60 };
  if (inTok > 0 || outTok > 0) return (inTok * p.in + outTok * p.out) / 1_000_000;
  return (totalTok * p.in) / 1_000_000; // sem split → estima tudo como input
}

interface DayPoint {
  day: string;
  collected: number;
  rewritten: number;
  delivered: number;
  failed: number;
  approved: number;
  duplicates: number;
  blogsReached: number;
  attemptsOk: number;
  attemptsTotal: number;
  avgDeliveryMs: number | null;
  aiCalls: number;
  aiTokens: number;
  aiCostUsd: number;
}

const emptyDay = (day: string): DayPoint => ({
  day, collected: 0, rewritten: 0, delivered: 0, failed: 0, approved: 0,
  duplicates: 0, blogsReached: 0, attemptsOk: 0, attemptsTotal: 0,
  avgDeliveryMs: null, aiCalls: 0, aiTokens: 0, aiCostUsd: 0,
});

/** Contadores + séries do dashboard. A resposta só GANHA chaves (contrato). */
router.get("/", async (_req, res) => {
  const SERIES_DAYS = 30;

  // ── Legado (mapas por status; o front antigo depende deles) ───────────────
  const newsByStatus = await db
    .select({ status: newsItemsTable.status, n: sql<number>`count(*)::int` })
    .from(newsItemsTable)
    .groupBy(newsItemsTable.status);

  const deliveriesByStatus = await db
    .select({ status: deliveriesTable.status, n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .groupBy(deliveriesTable.status);

  const blogsByStatus = await db
    .select({ status: blogsTable.status, n: sql<number>`count(*)::int` })
    .from(blogsTable)
    .groupBy(blogsTable.status);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [usageToday] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
    })
    .from(aiUsageEventsTable)
    .where(gte(aiUsageEventsTable.createdAt, startOfDay));

  // ── Séries diárias (últimos 30 dias, fuso do painel) ──────────────────────
  const collectedDaily = await db
    .select({ day: spDay(newsItemsTable.createdAt), n: sql<number>`count(*)::int` })
    .from(newsItemsTable)
    .where(sql`${newsItemsTable.createdAt} >= ${spSince(SERIES_DAYS)}`)
    .groupBy(spDay(newsItemsTable.createdAt));

  const rewrittenDaily = await db
    .select({ day: spDay(rewritesTable.createdAt), n: sql<number>`count(*)::int` })
    .from(rewritesTable)
    .where(sql`${rewritesTable.createdAt} >= ${spSince(SERIES_DAYS)} and ${rewritesTable.status} = 'ok'`)
    .groupBy(spDay(rewritesTable.createdAt));

  const deliveredDaily = await db
    .select({
      day: spDay(deliveriesTable.deliveredAt),
      n: sql<number>`count(*)::int`,
      blogs: sql<number>`count(distinct ${deliveriesTable.blogId})::int`,
    })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.deliveredAt} >= ${spSince(SERIES_DAYS)}`)
    .groupBy(spDay(deliveriesTable.deliveredAt));

  const attemptsDaily = await db
    .select({
      day: spDay(deliveryAttemptsTable.createdAt),
      total: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${deliveryAttemptsTable.ok})::int`,
      avgMs: sql<number | null>`avg(${deliveryAttemptsTable.durationMs}) filter (where ${deliveryAttemptsTable.ok})::float8`,
    })
    .from(deliveryAttemptsTable)
    .where(sql`${deliveryAttemptsTable.createdAt} >= ${spSince(SERIES_DAYS)}`)
    .groupBy(spDay(deliveryAttemptsTable.createdAt));

  const approvedDaily = await db
    .select({ day: spDay(deliveriesTable.approvedAt), n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.approvedAt} >= ${spSince(SERIES_DAYS)}`)
    .groupBy(spDay(deliveriesTable.approvedAt));

  // Duplicadas: ancora no updated_at (momento em que o blog respondeu duplicate).
  const duplicatesDaily = await db
    .select({ day: spDay(deliveriesTable.updatedAt), n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.updatedAt} >= ${spSince(SERIES_DAYS)} and ${deliveriesTable.status} = 'duplicate'`)
    .groupBy(spDay(deliveriesTable.updatedAt));

  const aiDaily = await db
    .select({
      day: spDay(aiUsageEventsTable.createdAt),
      provider: aiUsageEventsTable.provider,
      calls: sql<number>`count(*)::int`,
      inTok: sql<number>`coalesce(sum(${aiUsageEventsTable.inputTokens}), 0)::int`,
      outTok: sql<number>`coalesce(sum(${aiUsageEventsTable.outputTokens}), 0)::int`,
      totalTok: sql<number>`coalesce(sum(${aiUsageEventsTable.totalTokens}), 0)::int`,
    })
    .from(aiUsageEventsTable)
    .where(sql`${aiUsageEventsTable.createdAt} >= ${spSince(SERIES_DAYS)}`)
    .groupBy(spDay(aiUsageEventsTable.createdAt), aiUsageEventsTable.provider);

  const seriesMap = new Map<string, DayPoint>();
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000));
    seriesMap.set(key, emptyDay(key));
  }
  const at = (day: string) => seriesMap.get(day);
  for (const r of collectedDaily) at(r.day) && (at(r.day)!.collected = r.n);
  for (const r of rewrittenDaily) at(r.day) && (at(r.day)!.rewritten = r.n);
  for (const r of deliveredDaily) {
    const p = at(r.day);
    if (p) { p.delivered = r.n; p.blogsReached = r.blogs; }
  }
  for (const r of attemptsDaily) {
    const p = at(r.day);
    if (p) {
      p.attemptsTotal = r.total;
      p.attemptsOk = r.ok;
      p.failed = r.total - r.ok;
      p.avgDeliveryMs = r.avgMs == null ? null : Math.round(r.avgMs);
    }
  }
  for (const r of approvedDaily) at(r.day) && (at(r.day)!.approved = r.n);
  for (const r of duplicatesDaily) at(r.day) && (at(r.day)!.duplicates = r.n);
  for (const r of aiDaily) {
    const p = at(r.day);
    if (!p) continue;
    p.aiCalls += r.calls;
    p.aiTokens += r.totalTok;
    p.aiCostUsd += estimateCostUsd(r.provider, r.inTok, r.outTok, r.totalTok);
  }
  for (const p of seriesMap.values()) p.aiCostUsd = Math.round(p.aiCostUsd * 10_000) / 10_000;

  const series = [...seriesMap.values()];
  const today = series[series.length - 1] ?? emptyDay(dayKey(new Date()));
  const yesterday = series[series.length - 2] ?? emptyDay("");
  const rate = (p: DayPoint) =>
    p.attemptsTotal > 0 ? Math.round((p.attemptsOk / p.attemptsTotal) * 1000) / 10 : null;

  // ── Donut: entregas com atividade HOJE, por status ─────────────────────────
  const statusTodayRows = await db
    .select({ status: deliveriesTable.status, n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.updatedAt} >= ${spSince(0)}`)
    .groupBy(deliveriesTable.status);

  // ── Tabela de blogs conectados (hoje + spark 7d + sucesso 7d) ─────────────
  const blogRows = await db
    .select({
      id: blogsTable.id,
      name: blogsTable.name,
      domain: blogsTable.domain,
      status: blogsTable.status,
      isActive: blogsTable.isActive,
      lastSeenAt: blogsTable.lastSeenAt,
      maxPostsPerDay: blogsTable.maxPostsPerDay,
    })
    .from(blogsTable)
    .orderBy(blogsTable.name);

  const deliveredTodayByBlog = await db
    .select({ blogId: deliveriesTable.blogId, n: sql<number>`count(*)::int` })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.deliveredAt} >= ${spSince(0)}`)
    .groupBy(deliveriesTable.blogId);

  const spark7dByBlog = await db
    .select({
      blogId: deliveriesTable.blogId,
      day: spDay(deliveriesTable.deliveredAt),
      n: sql<number>`count(*)::int`,
    })
    .from(deliveriesTable)
    .where(sql`${deliveriesTable.deliveredAt} >= ${spSince(6)}`)
    .groupBy(deliveriesTable.blogId, spDay(deliveriesTable.deliveredAt));

  const success7dByBlog = await db
    .select({
      blogId: deliveriesTable.blogId,
      total: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${deliveryAttemptsTable.ok})::int`,
    })
    .from(deliveryAttemptsTable)
    .innerJoin(deliveriesTable, sql`${deliveriesTable.id} = ${deliveryAttemptsTable.deliveryId}`)
    .where(sql`${deliveryAttemptsTable.createdAt} >= ${spSince(6)}`)
    .groupBy(deliveriesTable.blogId);

  const last7Keys: string[] = [];
  for (let i = 6; i >= 0; i--) last7Keys.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  const todayMap = new Map(deliveredTodayByBlog.map((r) => [r.blogId, r.n]));
  const successMap = new Map(success7dByBlog.map((r) => [r.blogId, r]));
  const sparkMap = new Map<string, Map<string, number>>();
  for (const r of spark7dByBlog) {
    if (!sparkMap.has(r.blogId)) sparkMap.set(r.blogId, new Map());
    sparkMap.get(r.blogId)!.set(r.day, r.n);
  }
  const blogsTableOut = blogRows.map((b) => {
    const s = successMap.get(b.id);
    return {
      ...b,
      deliveredToday: todayMap.get(b.id) ?? 0,
      successRate7d: s && s.total > 0 ? Math.round((s.ok / s.total) * 1000) / 10 : null,
      spark: last7Keys.map((k) => sparkMap.get(b.id)?.get(k) ?? 0),
    };
  });

  // ── Atividade recente + saúde ──────────────────────────────────────────────
  const activity = await db
    .select({
      ts: centralEventLogsTable.ts,
      level: centralEventLogsTable.level,
      module: centralEventLogsTable.module,
      message: centralEventLogsTable.message,
    })
    .from(centralEventLogsTable)
    .orderBy(desc(centralEventLogsTable.ts))
    .limit(12);

  // epoch em ms (agregados voltam como texto cru do driver; epoch é inequívoco)
  const workerRows = await db
    .select({
      module: centralEventLogsTable.module,
      last: sql<number>`(extract(epoch from max(${centralEventLogsTable.ts})) * 1000)::float8`,
    })
    .from(centralEventLogsTable)
    .groupBy(centralEventLogsTable.module);

  const [aiLast] = await db
    .select({
      last: sql<number | null>`(extract(epoch from max(${aiUsageEventsTable.createdAt})) * 1000)::float8`,
    })
    .from(aiUsageEventsTable);

  const toMap = (rows: Array<{ status: string; n: number }>) =>
    Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const dMap = toMap(deliveriesByStatus);
  const bMap = toMap(blogsByStatus);

  res.json({
    // legado (front antigo)
    news: toMap(newsByStatus),
    deliveries: dMap,
    blogs: bMap,
    usageToday: usageToday ?? { calls: 0, totalTokens: 0 },

    // cards hoje × ontem
    cards: {
      collected: { today: today.collected, yesterday: yesterday.collected },
      rewritten: { today: today.rewritten, yesterday: yesterday.rewritten },
      delivered: { today: today.delivered, yesterday: yesterday.delivered },
      failures: { today: today.failed, yesterday: yesterday.failed },
      approved: { today: today.approved, yesterday: yesterday.approved },
      duplicates: { today: today.duplicates, yesterday: yesterday.duplicates },
      blogsReached: { today: today.blogsReached, yesterday: yesterday.blogsReached },
      successRate: { today: rate(today), yesterday: rate(yesterday) },
      avgDeliveryMs: { today: today.avgDeliveryMs, yesterday: yesterday.avgDeliveryMs },
      aiCalls: { today: today.aiCalls, yesterday: yesterday.aiCalls },
      aiTokens: { today: today.aiTokens, yesterday: yesterday.aiTokens },
      aiCostUsd: { today: today.aiCostUsd, yesterday: yesterday.aiCostUsd },
    },
    series: series.map(({ attemptsOk: _o, attemptsTotal: _t, ...p }) => p),
    statusToday: toMap(statusTodayRows),
    blogsTable: blogsTableOut,
    activity,
    health: {
      db: true,
      blogsOnline: bMap["online"] ?? 0,
      blogsTotal: blogRows.length,
      aiLastCallAt: aiLast?.last ?? null,
      workers: Object.fromEntries(workerRows.map((r) => [r.module, r.last])),
      queue: {
        pending: dMap["pending"] ?? 0,
        awaitingApproval: dMap["awaiting_approval"] ?? 0,
        awaitingLocalization: (dMap["awaiting_localization"] ?? 0) + (dMap["localizing"] ?? 0),
        failed: (dMap["failed"] ?? 0) + (dMap["dead"] ?? 0),
      },
    },
    generatedAt: new Date().toISOString(),
  });
});

export default router;
