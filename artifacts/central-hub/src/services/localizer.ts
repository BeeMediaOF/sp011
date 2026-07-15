/**
 * Localizer — traduz E/OU classifica entregas `awaiting_localization` (criadas
 * pelo distributor quando o idioma do blog difere da reescrita e/ou o blog tem
 * taxonomia própria sem targetCategory explícito na regra).
 *
 * Desenho (espelha os workers existentes):
 * - poll 20s, lote 2, claim condicional awaiting_localization → localizing;
 * - REUSO: tradução pronta p/ (newsItem, idioma) é repontada (2 blogs EN = 1
 *   tradução); a classificação continua por blog (taxonomias diferentes);
 * - tradução com categorias do blog no MESMO prompt (1 chamada resolve os dois);
 * - só classificação → classifyArticle (título+resumo, barata);
 * - tentativas de tradução em Map EM MEMÓRIA (nunca em delivery.attempts — esse
 *   é o orçamento das 5 tentativas HTTP do deliveryWorker); backoff 1m→5m→15m
 *   via nextRetryAt; 3 falhas → failed com lastError "translation: …";
 * - quota/config de provider indisponível NÃO consome tentativa;
 * - classificação NUNCA bloqueia: indecisão → fallback "others"/último slug;
 * - localiza ANTES da aprovação — o revisor vê conteúdo/categoria finais.
 */
import { randomUUID } from "node:crypto";
import {
  db,
  aiUsageEventsTable,
  blogsTable,
  deliveriesTable,
  newsItemsTable,
  rewritesTable,
  type BlogRow,
  type DeliveryRow,
  type RewriteRow,
} from "@workspace/central-db";
import {
  bestSocialTitle,
  classifyArticle,
  extractFromRawAI,
  plainTextLength,
  plainTextOf,
  translateRewrite,
  type RewriteEngineConfig,
  type TokenUsage,
} from "@workspace/news-engine";
import { and, asc, count, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logger } from "../lib/logger.js";
import { logEvent } from "../lib/eventLog.js";
import {
  MAX_TRANSLATION_ATTEMPTS,
  isProviderUnavailableError,
  needsClassification,
  needsTranslation,
  postLocalizationStatus,
  resolveDeliveryCategory,
  translationBackoffMs,
} from "../lib/localization.js";

const POLL_MS = 20_000;
const BATCH = 2;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

/** Tentativas de TRADUÇÃO por entrega (memória, padrão do rewriter). */
const _attempts = new Map<string, number>();

let _openaiIdx = 0;

/** Pool de chaves OpenAI-compatíveis (única + adicionais, rodízio por chamada). */
function nextOpenaiKey(s: HubSettings): string | undefined {
  const keys = [...new Set(
    [s.openaiApiKey, ...(s.openaiApiKeys ?? [])].map((k) => k?.trim()).filter((k): k is string => !!k),
  )];
  if (keys.length === 0) return undefined;
  return keys[_openaiIdx++ % keys.length];
}

function engineConfig(s: HubSettings): RewriteEngineConfig {
  const provider = s.translationProvider ?? "gemini";
  if (provider === "openai") {
    return {
      provider, model: s.translationModel,
      openaiApiKey: nextOpenaiKey(s), openaiBaseUrl: s.openaiBaseUrl, logger,
    };
  }
  if (provider === "ollama") {
    return {
      provider,
      model: s.translationModel,
      ollamaBaseUrl: s.ollamaBaseUrl || process.env["OLLAMA_BASE_URL"] || "http://ollama:11434",
      geminiPool: getGeminiPool(),
      fallbackToGemini: s.fallbackToGemini ?? true,
      logger,
    };
  }
  return { provider: "gemini", model: s.translationModel, geminiPool: getGeminiPool(), logger };
}

/** Meia-noite de HOJE em Brasília, expressa em UTC (mesma conta do distributor). */
function brMidnightUtc(): Date {
  const nowBr = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate(), 3, 0, 0));
}

/** Traduções feitas hoje (ai_usage_events) — guarda do translationMaxPerDay. */
async function translationsToday(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(aiUsageEventsTable)
    .where(and(
      eq(aiUsageEventsTable.purpose, "translate"),
      gte(aiUsageEventsTable.createdAt, brMidnightUtc()),
    ));
  return row?.n ?? 0;
}

async function logUsage(
  usage: TokenUsage | undefined, purpose: "translate" | "classify",
  newsItemId: string, rewriteId: string | null,
): Promise<void> {
  if (!usage) return;
  await db.insert(aiUsageEventsTable).values({
    newsItemId,
    rewriteId,
    provider: usage.provider,
    model: usage.model ?? null,
    keyHint: usage.keyHint ?? null,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    purpose,
  });
}

/** Devolve a entrega à fila de localização com backoff (não consome delivery.attempts). */
async function deferDelivery(delivery: DeliveryRow, delayMs: number, error?: string): Promise<void> {
  await db
    .update(deliveriesTable)
    .set({
      status: "awaiting_localization",
      nextRetryAt: new Date(Date.now() + delayMs),
      ...(error ? { lastError: error.slice(0, 500) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(deliveriesTable.id, delivery.id));
}

/**
 * Garante uma reescrita no idioma do blog: reusa variação pronta ou traduz.
 * Devolve a rewrite final + a categoria sugerida pela IA (quando a tradução
 * também classificou). Lança em falha de tradução (o chamador faz o backoff).
 */
async function ensureTranslatedRewrite(
  delivery: DeliveryRow, blog: BlogRow, shared: RewriteRow, s: HubSettings,
): Promise<{ rewrite: RewriteRow; aiCategory?: string; translated: boolean }> {
  // 1. Reuso: já existe tradução ok desta notícia neste idioma?
  const [existing] = await db
    .select()
    .from(rewritesTable)
    .where(and(
      eq(rewritesTable.newsItemId, delivery.newsItemId),
      eq(rewritesTable.language, blog.language),
      eq(rewritesTable.status, "ok"),
    ))
    .limit(1);
  if (existing) return { rewrite: existing, translated: false };

  // 2. Guarda de quota diária (não consome tentativa)
  const maxPerDay = Math.max(0, Math.floor(s.translationMaxPerDay ?? 0));
  if (maxPerDay > 0 && (await translationsToday()) >= maxPerDay) {
    throw new Error("QUOTA_COOLDOWN: teto diário de traduções atingido (translationMaxPerDay)");
  }

  // 3. Tradução (com a taxonomia do blog no MESMO prompt)
  const out = await translateRewrite(
    {
      title: shared.title ?? "",
      subtitle: shared.subtitle ?? undefined,
      socialTitle: shared.socialTitle ?? undefined,
      socialSummary: shared.socialSummary ?? undefined,
      socialHashtags: shared.socialHashtags ?? undefined,
      contentHtml: shared.contentHtml ?? "",
      keywords: shared.keywords ?? undefined,
      targetLanguage: blog.language,
      categories: blog.categories ?? [],
      promptTemplate: s.translationPromptTemplate,
    },
    engineConfig(s),
  );

  // Quality gate — mesmo filtro da reescrita (lixo/HTML irrecuperável → falha)
  const extracted = extractFromRawAI(out.content);
  if (!extracted || !out.title) {
    throw new Error("tradução ilegível (quality gate)");
  }
  // Tradução não pode encolher a matéria para um toco (modelo que "resume"
  // em vez de traduzir): falha → retry com backoff, igual às demais falhas.
  const srcLen = plainTextLength(shared.contentHtml ?? "");
  const outLen = plainTextLength(extracted.content);
  if (outLen < Math.min(700, Math.floor(srcLen * 0.5))) {
    throw new Error(`tradução curta demais (${outLen} chars visíveis; original ${srcLen})`);
  }

  // 4. Insere a variação; corrida com outro tick → re-select da vencedora
  const rewriteId = randomUUID();
  const inserted = await db
    .insert(rewritesTable)
    .values({
      id: rewriteId,
      newsItemId: delivery.newsItemId,
      blogId: blog.id,
      language: blog.language,
      title: out.title,
      subtitle: out.subtitle || null,
      // Mesma guarda do rewriter: manchete com palavra colada/inventada pelo
      // modelo não passa — cai no título traduzido.
      socialTitle: bestSocialTitle(
        out.socialTitle ?? null,
        out.title,
        `${out.title}\n${out.subtitle ?? ""}\n${plainTextOf(extracted.content)}`,
      ),
      socialSummary: out.socialSummary ?? null,
      socialHashtags: out.socialHashtags ?? null,
      contentHtml: extracted.content,
      slug: out.slug || null,
      keywords: out.keywords || null,
      provider: out.usage?.provider ?? (s.translationProvider ?? "gemini"),
      model: out.usage?.model ?? s.translationModel ?? null,
      status: "ok",
    })
    // rewrites_variant_uniq é um índice PARCIAL (WHERE blog_id IS NOT NULL):
    // sem o predicado no conflict target o Postgres rejeita a query inteira
    // (42P10) — era isso que derrubava TODA tradução com "translation: Failed
    // query: insert into rewrites".
    .onConflictDoNothing({
      target: [rewritesTable.newsItemId, rewritesTable.blogId],
      where: isNotNull(rewritesTable.blogId),
    })
    .returning();

  await logUsage(out.usage, "translate", delivery.newsItemId, inserted[0]?.id ?? null);

  if (inserted.length > 0) {
    return { rewrite: inserted[0]!, aiCategory: out.category, translated: true };
  }
  const [winner] = await db
    .select()
    .from(rewritesTable)
    .where(and(
      eq(rewritesTable.newsItemId, delivery.newsItemId),
      eq(rewritesTable.blogId, blog.id),
    ))
    .limit(1);
  if (!winner) throw new Error("conflito ao gravar tradução e variação não encontrada");
  return { rewrite: winner, aiCategory: out.category, translated: true };
}

async function processDelivery(delivery: DeliveryRow): Promise<void> {
  // Claim condicional
  const claimed = await db
    .update(deliveriesTable)
    .set({ status: "localizing", updatedAt: new Date() })
    .where(and(eq(deliveriesTable.id, delivery.id), eq(deliveriesTable.status, "awaiting_localization")))
    .returning({ id: deliveriesTable.id });
  if (claimed.length === 0) return;

  const s = getSettings();

  const [blog] = await db.select().from(blogsTable).where(eq(blogsTable.id, delivery.blogId)).limit(1);
  const [rewrite] = await db.select().from(rewritesTable).where(eq(rewritesTable.id, delivery.rewriteId)).limit(1);
  if (!blog || !rewrite) {
    await db
      .update(deliveriesTable)
      .set({ status: "failed", lastError: "translation: blog/reescrita não encontrados", updatedAt: new Date() })
      .where(eq(deliveriesTable.id, delivery.id));
    return;
  }

  try {
    let finalRewrite = rewrite;
    let aiCategory: string | undefined;

    if (needsTranslation(blog.language, rewrite.language)) {
      const result = await ensureTranslatedRewrite(delivery, blog, rewrite, s);
      finalRewrite = result.rewrite;
      aiCategory = result.aiCategory;
      if (result.translated) {
        logEvent({
          module: "localizer", refType: "delivery", refId: delivery.id,
          message: `Tradução (${blog.language}) pronta p/ ${blog.name}: ${finalRewrite.title ?? ""}`,
        });
      }
    }

    // Classificação: a tradução pode já ter devolvido a categoria; senão (ou
    // reuso/only-classify), chamada barata com título+resumo. NUNCA bloqueia.
    if (needsClassification(blog.categories, delivery.targetCategory) && !aiCategory) {
      try {
        const res = await classifyArticle(
          {
            title: finalRewrite.title ?? "",
            summary: finalRewrite.subtitle ?? finalRewrite.socialSummary ?? undefined,
            categories: blog.categories ?? [],
          },
          engineConfig(s),
        );
        aiCategory = res.category ?? undefined;
        await logUsage(res.usage, "classify", delivery.newsItemId, finalRewrite.id);
      } catch (err) {
        logger.warn({ err, deliveryId: delivery.id }, "Classificação falhou — usando fallback");
      }
    }

    const targetCategory = needsClassification(blog.categories, delivery.targetCategory)
      ? resolveDeliveryCategory({
          ruleCategory: delivery.targetCategory,
          aiCategory: aiCategory ?? null,
          categories: blog.categories,
        })
      : delivery.targetCategory;

    await db
      .update(deliveriesTable)
      .set({
        status: postLocalizationStatus(blog.requireApproval),
        rewriteId: finalRewrite.id,
        targetCategory,
        nextRetryAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(deliveriesTable.id, delivery.id));
    _attempts.delete(delivery.id);
  } catch (err) {
    const msg = String(err);

    // Provider indisponível/quota: não consome tentativa, re-tenta em 5 min
    if (isProviderUnavailableError(msg)) {
      await deferDelivery(delivery, 5 * 60_000, msg);
      logger.warn({ deliveryId: delivery.id, err: msg }, "Localizer: provider indisponível — re-tentará");
      return;
    }

    const attempts = (_attempts.get(delivery.id) ?? 0) + 1;
    _attempts.set(delivery.id, attempts);

    if (attempts >= MAX_TRANSLATION_ATTEMPTS) {
      await db
        .update(deliveriesTable)
        .set({
          status: "failed",
          lastError: `translation: ${msg}`.slice(0, 500),
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(deliveriesTable.id, delivery.id));
      _attempts.delete(delivery.id);
      logEvent({
        module: "localizer", level: "error", refType: "delivery", refId: delivery.id,
        message: `Tradução falhou após ${MAX_TRANSLATION_ATTEMPTS} tentativas (entrega marcada como failed)`,
        meta: { error: msg.slice(0, 300) },
      });
    } else {
      await deferDelivery(delivery, translationBackoffMs(attempts), `translation: ${msg}`);
      logger.warn({ deliveryId: delivery.id, attempts, err: msg }, "Localizer: tradução falhou — retentará");
    }
  }
}

async function tick(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const s = getSettings();
    if (!s.deliveryEnabled) return;

    const now = new Date();
    const due = await db
      .select()
      .from(deliveriesTable)
      .where(and(
        eq(deliveriesTable.status, "awaiting_localization"),
        or(isNull(deliveriesTable.nextRetryAt), lte(deliveriesTable.nextRetryAt, now)),
      ))
      .orderBy(asc(deliveriesTable.createdAt))
      .limit(BATCH);

    for (const delivery of due) {
      await processDelivery(delivery);
    }
  } catch (err) {
    logger.error({ err }, "Erro no tick do localizer");
  } finally {
    _running = false;
  }
}

export function startLocalizer(): void {
  if (_timer) return;
  _timer = setInterval(() => { void tick(); }, POLL_MS);
  _timer.unref();
  logger.info("Localizer iniciado (poll 20s, tradução + classificação por entrega)");
}
