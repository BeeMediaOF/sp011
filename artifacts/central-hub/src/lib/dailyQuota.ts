/**
 * Portão de economia por teto diário dos blogs.
 *
 * Quando a fila de entregas já cobre o teto diário (blogs.maxPostsPerDay) de
 * TODOS os blogs ativos que recebem conteúdo, coletar e reescrever mais só
 * geraria entregas agendadas para o dia seguinte — gastando scraping e tokens
 * de IA hoje à toa. O collector e o rewriter consultam este módulo e pausam.
 *
 * Semântica por blog ativo COM regra ativa:
 *   - sem maxPostsPerDay (null/0) → demanda ilimitada → o pipeline NUNCA pausa;
 *   - saturado quando (entregues hoje) + (fila em espera) >= maxPostsPerDay.
 *     "Em espera" = awaiting_approval / awaiting_localization / localizing /
 *     pending / delivering — inclui o excedente já agendado para amanhã.
 *
 * A checagem é recalculada a cada chamada (memo de 60s): cancelar entregas ou
 * o virar do dia reabrem a coleta sozinhos. O localizer e o deliveryWorker NÃO
 * são pausados — a fila existente precisa continuar andando.
 */
import {
  db,
  blogsTable,
  deliveriesTable,
  distributionRulesTable,
} from "@workspace/central-db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { logEvent } from "./eventLog.js";
import { isDailyQuotaFilled, resolveDefaultCap, DEFAULT_MAX_POSTS_PER_DAY } from "./dailyQuotaCore.js";

// Núcleo puro (testável sem DB) em ./dailyQuotaCore.ts; re-exportado para os
// consumidores que já importavam DEFAULT_MAX_POSTS_PER_DAY daqui.
export { isDailyQuotaFilled, DEFAULT_MAX_POSTS_PER_DAY } from "./dailyQuotaCore.js";

const MEMO_MS = 60_000;
let _memo: { at: number; reason: string | null } | null = null;
let _lastFilled = false;

/** Meia-noite de HOJE em Brasília, expressa em UTC (mesma regra do distributor). */
function brMidnightUtc(): Date {
  const nowBr = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate(), 3, 0, 0));
}

/**
 * Motivo da pausa quando a fila do dia está cheia em todos os blogs;
 * null = ainda há vaga (ou existe blog sem teto → nunca pausa).
 */
export async function dailyQuotaFilledReason(): Promise<string | null> {
  if (_memo && Date.now() - _memo.at < MEMO_MS) return _memo.reason;

  let reason: string | null = null;
  try {
    reason = await compute();
  } catch (err) {
    // Falha na checagem nunca pode travar o pipeline — segue coletando.
    logger.warn({ err }, "dailyQuota: falha ao calcular — seguindo sem pausa");
  }
  _memo = { at: Date.now(), reason };

  const filled = reason !== null;
  if (filled !== _lastFilled) {
    _lastFilled = filled;
    logEvent({
      module: "collector",
      message: filled
        ? `Economia: ${reason} — coleta e reescrita pausadas até abrir vaga (vira o dia ou entregas saem da fila).`
        : "Economia: voltou a haver vaga na fila diária — coleta e reescrita retomadas.",
    });
  }
  return reason;
}

async function compute(): Promise<string | null> {
  const blogs = await db
    .select({
      id: blogsTable.id,
      name: blogsTable.name,
      maxPostsPerDay: blogsTable.maxPostsPerDay,
    })
    .from(blogsTable)
    .where(eq(blogsTable.isActive, true));
  if (blogs.length === 0) return null;

  // Só blogs que efetivamente recebem conteúdo (têm regra ativa) contam.
  const ruleRows = await db
    .select({ blogId: distributionRulesTable.blogId })
    .from(distributionRulesTable)
    .where(and(
      eq(distributionRulesTable.isActive, true),
      inArray(distributionRulesTable.blogId, blogs.map((b) => b.id)),
    ));
  const withRules = new Set(ruleRows.map((r) => r.blogId));
  const candidates = blogs.filter((b) => withRules.has(b.id));
  if (candidates.length === 0) return null;

  // PRD-11/F13: NÃO curto-circuitar para "ilimitado" quando falta teto — blog
  // sem maxPostsPerDay usa o DEFAULT_MAX_POSTS_PER_DAY (via isDailyQuotaFilled),
  // então o portão de economia sempre pode fechar.
  const counts = await db
    .select({
      blogId: deliveriesTable.blogId,
      waiting: sql<number>`count(*) filter (where ${deliveriesTable.status} in ('awaiting_approval','awaiting_localization','localizing','pending','delivering'))`,
      deliveredToday: sql<number>`count(*) filter (where ${deliveriesTable.status} = 'delivered' and ${deliveriesTable.deliveredAt} >= ${brMidnightUtc()})`,
    })
    .from(deliveriesTable)
    .where(inArray(deliveriesTable.blogId, candidates.map((b) => b.id)))
    .groupBy(deliveriesTable.blogId);
  const occupiedByBlog = new Map<string, number>(
    counts.map((c) => [c.blogId, Number(c.waiting ?? 0) + Number(c.deliveredToday ?? 0)]),
  );
  return isDailyQuotaFilled(candidates, occupiedByBlog, resolveDefaultCap());
}
