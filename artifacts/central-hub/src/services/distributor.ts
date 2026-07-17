/**
 * Distribuidor — avalia as regras de cada blog ativo para toda notícia
 * `rewritten` e cria as entregas (`deliveries`), respeitando:
 * - requireApproval do blog → entrega nasce `awaiting_approval`;
 * - minMinutesBetweenPosts → espaça `scheduledAt` por blog;
 * - maxPostsPerDay → excedente é agendado para o dia seguinte (00:00 BR).
 * O UNIQUE (news_item_id, blog_id) garante no máximo 1 entrega por notícia/blog.
 */
import { randomUUID } from "node:crypto";
import {
  db,
  blogsTable,
  deliveriesTable,
  distributionRulesTable,
  newsItemsTable,
  rewritesTable,
} from "@workspace/central-db";
import { and, eq, gte, inArray, isNull, max, count } from "drizzle-orm";
import { getSettings } from "../lib/store.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import { matchBlogRules } from "../lib/rules.js";

const POLL_MS = 30_000;
const BATCH = 20;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/** Meia-noite de HOJE em Brasília, expressa em UTC. */
function brMidnightUtc(daysAhead = 0): Date {
  const nowBr = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(
    nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate() + daysAhead, 3, 0, 0,
  ));
}

interface BlogPacing {
  lastScheduledAt: number; // ms
  scheduledToday: number;
}

async function loadPacing(blogId: string): Promise<BlogPacing> {
  const activeStatuses = ["awaiting_approval", "pending", "delivering", "delivered", "duplicate"];
  const [lastRow] = await db
    .select({ last: max(deliveriesTable.scheduledAt) })
    .from(deliveriesTable)
    .where(and(eq(deliveriesTable.blogId, blogId), inArray(deliveriesTable.status, activeStatuses)));
  const [todayRow] = await db
    .select({ n: count() })
    .from(deliveriesTable)
    .where(and(
      eq(deliveriesTable.blogId, blogId),
      inArray(deliveriesTable.status, activeStatuses),
      gte(deliveriesTable.createdAt, brMidnightUtc()),
    ));
  return {
    lastScheduledAt: lastRow?.last?.getTime() ?? 0,
    scheduledToday: todayRow?.n ?? 0,
  };
}

export async function runDistributorCycle(): Promise<number> {
  const s = getSettings();
  if (!s.deliveryEnabled) return 0;

  // Notícias reescritas com reescrita compartilhada pronta
  const items = await db
    .select({
      news: newsItemsTable,
      rewriteId: rewritesTable.id,
      rewriteLanguage: rewritesTable.language,
      auditStatus: rewritesTable.auditStatus,
    })
    .from(newsItemsTable)
    .innerJoin(
      rewritesTable,
      and(
        eq(rewritesTable.newsItemId, newsItemsTable.id),
        isNull(rewritesTable.blogId),
        eq(rewritesTable.status, "ok"),
      ),
    )
    .where(eq(newsItemsTable.status, "rewritten"))
    .limit(BATCH);
  if (items.length === 0) return 0;

  const blogs = await db.select().from(blogsTable).where(eq(blogsTable.isActive, true));
  const allRules = blogs.length
    ? await db
        .select()
        .from(distributionRulesTable)
        .where(and(
          eq(distributionRulesTable.isActive, true),
          inArray(distributionRulesTable.blogId, blogs.map((b) => b.id)),
        ))
    : [];
  const rulesByBlog = new Map<string, typeof allRules>();
  for (const rule of allRules) {
    const list = rulesByBlog.get(rule.blogId) ?? [];
    list.push(rule);
    rulesByBlog.set(rule.blogId, list);
  }

  // Pacing por blog carregado uma vez por ciclo e atualizado em memória
  const pacing = new Map<string, BlogPacing>();

  let created = 0;

  for (const { news, rewriteId, rewriteLanguage, auditStatus } of items) {
    // IA Auditora (F5): reescrita suspeita fica SEGURA até o veredito (o
    // worker de auditoria resolve para passed/flagged/rejected). Com a
    // auditora desligada o pending é ignorado — nada fica preso.
    if ((s.auditEnabled ?? false) && auditStatus === "pending") continue;

    const searchText = `${news.title} ${news.description ?? ""}`;
    const sourceLang = rewriteLanguage ?? "pt-BR"; // null = legado pt-BR
    // flagged → toda entrega nasce aguardando aprovação humana (Revisão),
    // independente do requireApproval do blog.
    const auditFlagged = auditStatus === "flagged";

    for (const blog of blogs) {
      const rules = rulesByBlog.get(blog.id) ?? [];
      if (rules.length === 0) continue; // blog sem regra não recebe nada

      const match = matchBlogRules(rules, {
        category: news.category,
        sourceId: news.sourceId,
        text: searchText,
      });
      if (!match.matched) continue;

      let pace = pacing.get(blog.id);
      if (!pace) {
        pace = await loadPacing(blog.id);
        pacing.set(blog.id, pace);
      }

      // Agenda respeitando intervalo mínimo e teto diário
      let scheduledAt = new Date();
      if (blog.minMinutesBetweenPosts && pace.lastScheduledAt > 0) {
        const nextAllowed = pace.lastScheduledAt + blog.minMinutesBetweenPosts * 60_000;
        if (nextAllowed > scheduledAt.getTime()) scheduledAt = new Date(nextAllowed);
      }
      if (blog.maxPostsPerDay && pace.scheduledToday >= blog.maxPostsPerDay) {
        scheduledAt = brMidnightUtc(1); // dia seguinte
      }

      // Localizer: idioma do blog difere da reescrita → traduzir; blog com
      // taxonomia e regra SEM targetCategory explícito → classificar por IA.
      // Nos dois casos a entrega nasce awaiting_localization (o rewriteId
      // aponta a reescrita compartilhada até o localizer trocar) e a aprovação
      // acontece DEPOIS — o revisor vê o conteúdo/categoria finais.
      const needsTranslation = blog.language !== sourceLang;
      const needsClassification =
        (blog.categories?.length ?? 0) > 0 && !match.targetCategory;
      const status = needsTranslation || needsClassification
        ? "awaiting_localization"
        : (blog.requireApproval || auditFlagged ? "awaiting_approval" : "pending");

      try {
        const inserted = await db
          .insert(deliveriesTable)
          .values({
            id: randomUUID(),
            newsItemId: news.id,
            rewriteId,
            blogId: blog.id,
            status,
            scheduledAt,
            nextRetryAt: null,
            targetCategory: match.targetCategory ?? null,
            targetTag: match.targetTag ?? null,
          })
          .onConflictDoNothing({
            target: [deliveriesTable.newsItemId, deliveriesTable.blogId],
          })
          .returning({ id: deliveriesTable.id });

        if (inserted.length > 0) {
          created++;
          pace.lastScheduledAt = scheduledAt.getTime();
          pace.scheduledToday++;
          const suffix = status === "awaiting_localization"
            ? " (aguardando tradução/categoria)"
            : status === "awaiting_approval" ? " (aguardando aprovação)" : "";
          logEvent({
            module: "distributor", refType: "delivery", refId: inserted[0]!.id,
            message: `Entrega criada p/ ${blog.name}${suffix}: ${news.title}`,
          });
        }
      } catch (err) {
        logger.warn({ err, blogId: blog.id, newsItemId: news.id }, "Falha ao criar entrega");
      }
    }

    await db
      .update(newsItemsTable)
      .set({ status: "distributed", updatedAt: new Date() })
      .where(eq(newsItemsTable.id, news.id));
  }

  if (created > 0) logger.info({ created }, "Ciclo do distribuidor concluído");
  return created;
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    await runDistributorCycle();
  } catch (err) {
    logger.error({ err }, "Erro no ciclo do distribuidor");
  } finally {
    _running = false;
  }
}

export function startDistributor(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Distribuidor iniciado (poll 30s)");
}
