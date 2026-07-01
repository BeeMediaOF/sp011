/**
 * Automação de postagem no Instagram.
 *
 * De tempos em tempos pega as notícias mais recentes do blog (status=published),
 * aplica uma das máscaras selecionadas (rotaciona entre elas), monta a legenda e
 * enfileira em `social_publication_queue`. O motor existente (`queueProcessor`)
 * renderiza a arte e publica. Também é chamado manualmente pelo endpoint
 * `/automation/run` (com `force`) para teste imediato.
 */

import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  articlesTable,
  socialPublicationQueueTable,
  socialTemplatesTable,
} from "@workspace/db";
import { and, eq, gte, lte, ne, inArray, desc } from "drizzle-orm";
import { store } from "../store.js";
import { logger } from "../logger.js";
import { processSocialQueue, getPublicBase } from "./queueProcessor.js";
import { analyzeArticleCaption, type CaptionMissing } from "./caption.js";

/** Statuses que já "consomem" um artigo → não enfileirar de novo. */
const ACTIVE_QUEUE_STATUSES = ["pending", "processing", "published"];

/** Contador global p/ rotacionar as máscaras entre os posts. */
let _rotation = 0;
/** Evita ciclos concorrentes (render/publish pode demorar). */
let _running = false;

export interface AutomationRunResult {
  enqueued: number;
  articles: { id: string; title: string }[];
  /** Artigos elegíveis que foram PULADOS por legenda incompleta (verificação). */
  skipped?: { id: string; title: string; missing: CaptionMissing[] }[];
  reason?: string;
}

function isDue(lastRunAt: string | undefined, intervalMinutes: number): boolean {
  if (!lastRunAt) return true;
  const elapsed = Date.now() - new Date(lastRunAt).getTime();
  return elapsed >= Math.max(1, intervalMinutes) * 60 * 1000;
}

/**
 * Roda um ciclo da automação. Em modo normal respeita `enabled` e atualiza a
 * marca de agenda (`lastRunAt`). Em `force` (teste manual) ignora `enabled` e
 * NÃO mexe na agenda; `backfillHours` amplia a janela p/ pegar artigos recentes.
 */
export async function runAutomationCycle(
  opts: { force?: boolean; backfillHours?: number } = {},
): Promise<AutomationRunResult> {
  if (_running) return { enqueued: 0, articles: [], reason: "ciclo já em execução" };
  _running = true;
  try {
    const cfg = store.getSocialConfig();
    const auto = cfg.automation;

    if (!auto) return { enqueued: 0, articles: [], reason: "automação não configurada" };
    if (!auto.enabled && !opts.force) return { enqueued: 0, articles: [], reason: "automação desligada" };

    const accountIds = auto.accountIds ?? [];
    const templateIds = auto.templateIds ?? [];
    const types = (auto.types?.length ? auto.types : ["feed"]) as ("feed" | "story")[];
    const maxPerRun = Math.max(1, auto.maxPerRun || 3);

    if (!accountIds.length) return { enqueued: 0, articles: [], reason: "nenhuma conta selecionada" };
    if (!templateIds.length) return { enqueued: 0, articles: [], reason: "nenhuma máscara selecionada" };

    const now = new Date();

    // Janela elegível. Normal: só artigos publicados a partir de quando a
    // automação foi ligada (não despeja o acervo antigo). Force+backfill: varre
    // as últimas N horas para permitir teste imediato.
    const enabledAt = auto.enabledAt ? new Date(auto.enabledAt) : now;
    const cutoff = opts.force && opts.backfillHours
      ? new Date(now.getTime() - opts.backfillHours * 3600 * 1000)
      : enabledAt;

    // Idade mínima: só posta artigos publicados há pelo menos `minAgeMinutes`.
    const maxPublishedAt = auto.minAgeMinutes
      ? new Date(now.getTime() - auto.minAgeMinutes * 60 * 1000)
      : now;

    const conds = [
      eq(articlesTable.status, "published"),
      gte(articlesTable.publishedAt, cutoff),
      lte(articlesTable.publishedAt, maxPublishedAt),
    ];
    if (auto.onlyWithImage !== false) conds.push(ne(articlesTable.imageUrl, ""));

    const candidates = await db
      .select({
        id: articlesTable.id,
        title: articlesTable.title,
        socialTitle: articlesTable.socialTitle,
        subtitle: articlesTable.subtitle,
        category: articlesTable.category,
        author: articlesTable.author,
        imageUrl: articlesTable.imageUrl,
        publishedAt: articlesTable.publishedAt,
        content: articlesTable.content,
        keywords: articlesTable.keywords,
        slug: articlesTable.slug,
        socialSummary: articlesTable.socialSummary,
        socialHashtags: articlesTable.socialHashtags,
      })
      .from(articlesTable)
      .where(and(...conds))
      .orderBy(desc(articlesTable.publishedAt))
      .limit(maxPerRun * 3);

    if (!candidates.length) return { enqueued: 0, articles: [], reason: "nenhuma notícia elegível" };

    // Dedup: descarta pares (artigo, conta, tipo) que já estão na fila/publicados.
    const candidateIds = candidates.map((c) => c.id);
    const existing = await db
      .select({
        articleId: socialPublicationQueueTable.articleId,
        socialAccountId: socialPublicationQueueTable.socialAccountId,
        type: socialPublicationQueueTable.type,
      })
      .from(socialPublicationQueueTable)
      .where(
        and(
          inArray(socialPublicationQueueTable.articleId, candidateIds),
          inArray(socialPublicationQueueTable.socialAccountId, accountIds),
          inArray(socialPublicationQueueTable.status, ACTIVE_QUEUE_STATUSES),
        ),
      );
    const taken = new Set(existing.map((e) => `${e.articleId}::${e.socialAccountId}::${e.type}`));

    // Máscaras selecionadas, agrupadas por tipo (feed/story) p/ casar o post.
    const templates = await db
      .select({ id: socialTemplatesTable.id, type: socialTemplatesTable.type })
      .from(socialTemplatesTable)
      .where(inArray(socialTemplatesTable.id, templateIds));
    const byType = new Map<string, string[]>();
    for (const t of templates) {
      const arr = byType.get(t.type) ?? [];
      arr.push(t.id);
      byType.set(t.type, arr);
    }
    const allTemplateIds = templates.map((t) => t.id);
    const pickTemplate = (postType: string): string | null => {
      const pool = (byType.get(postType)?.length ? byType.get(postType) : allTemplateIds) ?? [];
      if (!pool.length) return null;
      return pool[_rotation++ % pool.length] ?? null;
    };

    const captionTemplate = cfg.captionTemplate || "";
    const base = getPublicBase();
    const usedArticles: { id: string; title: string }[] = [];
    const skipped: { id: string; title: string; missing: CaptionMissing[] }[] = [];
    let enqueued = 0;

    for (const art of candidates) {
      if (usedArticles.length >= maxPerRun) break;

      // Verificação: não publica automaticamente uma legenda incompleta
      // (sem resumo / link / hashtags que o template pede).
      const analysis = analyzeArticleCaption(art, captionTemplate, base);
      if (analysis.missing.length > 0) {
        skipped.push({ id: art.id, title: art.title, missing: analysis.missing });
        logger.warn(
          { articleId: art.id, missing: analysis.missing },
          "Social automation: artigo pulado — legenda incompleta",
        );
        continue;
      }
      const caption = analysis.caption;

      let insertedForArticle = false;
      for (const accountId of accountIds) {
        for (const type of types) {
          const key = `${art.id}::${accountId}::${type}`;
          if (taken.has(key)) continue;
          const templateId = pickTemplate(type);
          if (!templateId) continue;

          await db.insert(socialPublicationQueueTable).values({
            id: randomUUID(),
            articleId: art.id,
            socialAccountId: accountId,
            templateId,
            type,
            status: "pending",
            caption,
            scheduledAt: now,
          });
          taken.add(key);
          enqueued++;
          insertedForArticle = true;
        }
      }
      if (insertedForArticle) usedArticles.push({ id: art.id, title: art.title });
    }

    // Atualiza a agenda apenas em ciclo normal (force = teste, não mexe no ritmo).
    if (!opts.force) {
      store.updateSocialConfig({
        automation: { ...auto, lastRunAt: now.toISOString(), lastCount: enqueued },
      });
    }

    // Publica já o que foi enfileirado (não espera o cron de 5 min).
    if (enqueued > 0) {
      try {
        await processSocialQueue(Math.max(enqueued, 5));
      } catch (err) {
        logger.warn({ err }, "Social automation: processSocialQueue falhou (itens seguem na fila)");
      }
    }

    const reason = enqueued === 0 && skipped.length > 0
      ? `${skipped.length} artigo(s) pulado(s) por legenda incompleta`
      : undefined;
    return { enqueued, articles: usedArticles, skipped, reason };
  } finally {
    _running = false;
  }
}

let _cronStarted = false;

export function startSocialAutomation(): void {
  if (_cronStarted) return;
  _cronStarted = true;

  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // checa a cada 5 min

  const tick = async (): Promise<void> => {
    try {
      const auto = store.getSocialConfig().automation;
      if (!auto?.enabled) return;
      if (!isDue(auto.lastRunAt, auto.intervalMinutes || 120)) return;
      const r = await runAutomationCycle();
      if (r.enqueued > 0) logger.info({ enqueued: r.enqueued }, "Social automation: ciclo enfileirou posts");
    } catch (err) {
      logger.error({ err }, "Social automation tick error");
    }
  };

  // Warm-up de 90 s (deixa o servidor subir), depois checa periodicamente.
  setTimeout(() => {
    void tick();
    setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
  }, 90_000);

  logger.info("Social automation scheduler iniciado (checa a cada 5 min)");
}
