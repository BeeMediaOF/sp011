import { randomUUID } from "crypto";
import { eq, or, and, isNull, desc, sql, inArray, type SQL } from "drizzle-orm";
import { db, articlesTable, articleViewsTable, type ArticleRow } from "@workspace/db";

/** Quais artigos a limpeza automática pode remover. */
export type RetentionScope = "all" | "published" | "draft";

/** Regra completa da limpeza automática de artigos. */
export interface RetentionOptions {
  /** Idade mínima (em dias) para um artigo ser candidato à exclusão. */
  days: number;
  /** Status alvo: todos, só publicados ou só rascunhos. */
  scope: RetentionScope;
  /** Categorias que NUNCA são excluídas (comparadas em minúsculas). */
  protectCategories?: string[];
  /** Quando true, só exclui artigos importados automaticamente (rss/perplexity). */
  onlyAutomated?: boolean;
  /** Preserva artigos com visualizações ≥ este valor (0 = desativado). */
  minViews?: number;
  /** Sempre mantém os N artigos mais recentes, independentemente da idade (0 = desativado). */
  keepRecent?: number;
  /** Máximo de artigos excluídos por execução (0 = ilimitado). */
  maxPerRun?: number;
}

/** Idade efetiva do artigo (published_at com fallback para created_at). */
const AGE_EXPR = sql`COALESCE(${articlesTable.publishedAt}, ${articlesTable.createdAt})`;

/** Normaliza o nº de dias de retenção para um intervalo seguro (1..3650). */
function clampRetentionDays(days: number): number {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1) return 180;
  return Math.min(n, 3650);
}

function toNonNegInt(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Monta a condição SQL que define os artigos candidatos à exclusão, combinando
 * idade + todas as proteções configuradas. É assíncrona porque `keepRecent`
 * precisa consultar a data-limite dos N artigos mais recentes.
 */
async function buildRetentionWhere(opts: RetentionOptions): Promise<{ where: SQL; effDays: number; cutoff: Date }> {
  const effDays = clampRetentionDays(opts.days);
  const cutoff = new Date(Date.now() - effDays * 24 * 3600 * 1000);

  const conds: SQL[] = [sql`${AGE_EXPR} < ${cutoff}`];

  if (opts.scope !== "all") {
    conds.push(sql`${articlesTable.status} = ${opts.scope}`);
  }

  const cats = (opts.protectCategories ?? [])
    .map((c) => c.toLowerCase().trim())
    .filter((c) => c.length > 0);
  if (cats.length > 0) {
    conds.push(sql`lower(${articlesTable.category}) NOT IN (${sql.join(cats.map((c) => sql`${c}`), sql`, `)})`);
  }

  if (opts.onlyAutomated) {
    conds.push(sql`${articlesTable.origin} IN ('rss', 'perplexity')`);
  }

  const minViews = toNonNegInt(opts.minViews);
  if (minViews > 0) {
    conds.push(sql`NOT EXISTS (
      SELECT 1 FROM ${articleViewsTable}
      WHERE ${articleViewsTable.articleId} = ${articlesTable.id}
        AND ${articleViewsTable.views} >= ${minViews}
    )`);
  }

  const keepRecent = toNonNegInt(opts.keepRecent);
  if (keepRecent > 0) {
    const recent = await db
      .select({ d: sql<string>`${AGE_EXPR}` })
      .from(articlesTable)
      .orderBy(desc(AGE_EXPR))
      .limit(keepRecent);
    if (recent.length >= keepRecent && recent[keepRecent - 1]?.d) {
      // Só exclui artigos mais antigos que o N-ésimo mais recente.
      conds.push(sql`${AGE_EXPR} < ${new Date(recent[keepRecent - 1]!.d)}`);
    } else {
      // Menos artigos que o mínimo a preservar → não exclui nada.
      conds.push(sql`false`);
    }
  }

  return { where: and(...conds) as SQL, effDays, cutoff };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

export interface Article {
  id: string;
  title: string;
  /** Título curto p/ artes sociais (só imagem; pode ter *destaque*). */
  socialTitle?: string;
  /** Resumo curto (IA) p/ legenda de rede social ({{summary}}). */
  socialSummary?: string;
  /** Hashtags (IA) p/ legenda de rede social ({{hashtags}}). */
  socialHashtags?: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  origin?: "manual" | "rss" | "perplexity";
  rssSourceId?: string;
  rssSourceName?: string;
  rssSourceUrl?: string;
  aiRewritten?: boolean;
  slug?: string;
  keywords?: string;
  draftReason?: string;
  canonicalUrl?: string;
}

function rowToArticle(row: ArticleRow): Article {
  return {
    id:            row.id,
    title:         row.title,
    socialTitle:   row.socialTitle ?? undefined,
    socialSummary:  row.socialSummary ?? undefined,
    socialHashtags: row.socialHashtags ?? undefined,
    subtitle:      row.subtitle,
    content:       row.content,
    category:      row.category,
    tag:           row.tag,
    imageUrl:      row.imageUrl,
    author:        row.author,
    publishedAt:   row.publishedAt?.toISOString() ?? new Date().toISOString(),
    status:        row.status,
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
    origin:        row.origin ?? undefined,
    rssSourceId:   row.rssSourceId ?? undefined,
    rssSourceName: row.rssSourceName ?? undefined,
    rssSourceUrl:  row.rssSourceUrl ?? undefined,
    aiRewritten:   row.aiRewritten ?? undefined,
    slug:          row.slug ?? undefined,
    keywords:      row.keywords ?? undefined,
    draftReason:   row.draftReason ?? undefined,
    canonicalUrl:  row.canonicalUrl ?? undefined,
  };
}

// ─── In-memory article cache (30s TTL) ────────────────────────────────────────
let _cache: Article[] | null = null;
let _cacheAt = 0;
const CACHE_TTL = 30_000;

function bustCache() { _cache = null; _cacheAt = 0; }

export const articleService = {
  async getArticles(): Promise<Article[]> {
    if (_cache && Date.now() - _cacheAt < CACHE_TTL) return [..._cache];
    const rows = await db
      .select()
      .from(articlesTable)
      .orderBy(desc(articlesTable.createdAt));
    _cache = rows.map(rowToArticle);
    _cacheAt = Date.now();
    return [..._cache];
  },

  /** Returns drafts that haven't been AI-rewritten yet (up to `limit`). */
  async getPendingRewrites(limit = 50): Promise<Article[]> {
    const rows = await db
      .select()
      .from(articlesTable)
      .where(
        and(
          eq(articlesTable.status, "draft"),
          or(
            isNull(articlesTable.aiRewritten),
            eq(articlesTable.aiRewritten, false),
          ),
        ),
      )
      .orderBy(desc(articlesTable.createdAt))
      .limit(limit);
    return rows.map(rowToArticle);
  },

  async getArticle(idOrSlug: string): Promise<Article | null> {
    const rows = await db
      .select()
      .from(articlesTable)
      .where(or(eq(articlesTable.id, idOrSlug), eq(articlesTable.slug, idOrSlug)))
      .limit(1);
    return rows[0] ? rowToArticle(rows[0]) : null;
  },

  async isDuplicateArticle(
    title: string,
    rssSourceUrl?: string,
    imageUrl?: string,
  ): Promise<boolean> {
    const norm = title.trim().toLowerCase();

    // 1. Exact title / source URL / image URL match via SQL
    const conditions = [sql`lower(trim(${articlesTable.title})) = ${norm}`];
    if (rssSourceUrl?.length)     conditions.push(eq(articlesTable.rssSourceUrl, rssSourceUrl));
    if (imageUrl && imageUrl.length > 10) conditions.push(eq(articlesTable.imageUrl, imageUrl));

    const exact = await db
      .select({ id: articlesTable.id })
      .from(articlesTable)
      .where(or(...conditions))
      .limit(1);

    if (exact.length > 0) return true;

    // 2. Word-overlap check on the last 500 article titles (in-memory)
    const keywords = (s: string): Set<string> =>
      new Set(
        s.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3),
      );

    const incomingWords = keywords(title);
    if (incomingWords.size < 4) return false;

    const recent = await db
      .select({ title: articlesTable.title })
      .from(articlesTable)
      .orderBy(desc(articlesTable.createdAt))
      .limit(500);

    return recent.some((a) => {
      const existingWords = keywords(a.title);
      if (existingWords.size < 4) return false;
      const shared = [...incomingWords].filter((w) => existingWords.has(w)).length;
      const overlap = shared / Math.min(incomingWords.size, existingWords.size);
      return overlap >= 0.65;
    });
  },

  async createArticle(
    data: Omit<Article, "id" | "createdAt" | "updatedAt">,
  ): Promise<Article> {
    bustCache();
    const now = new Date();
    const id  = randomUUID();
    const slug = data.slug ?? slugify(data.title);

    const rows = await db
      .insert(articlesTable)
      .values({
        id,
        title:         data.title,
        socialTitle:   data.socialTitle ?? null,
        socialSummary:  data.socialSummary ?? null,
        socialHashtags: data.socialHashtags ?? null,
        subtitle:      data.subtitle ?? "",
        content:       data.content ?? "",
        category:      data.category ?? "geral",
        tag:           data.tag ?? "GERAL",
        imageUrl:      data.imageUrl ?? "",
        author:        data.author ?? "Redação",
        publishedAt:   data.publishedAt ? new Date(data.publishedAt) : now,
        status:        data.status ?? "draft",
        origin:        data.origin,
        rssSourceId:   data.rssSourceId,
        rssSourceName: data.rssSourceName,
        rssSourceUrl:  data.rssSourceUrl,
        aiRewritten:   data.aiRewritten ?? false,
        slug,
        keywords:      data.keywords,
        draftReason:   data.draftReason ?? null,
        canonicalUrl:  data.canonicalUrl ?? null,
        createdAt:     now,
        updatedAt:     now,
      })
      .returning();

    return rowToArticle(rows[0]!);
  },

  async updateArticle(
    id: string,
    data: Partial<Omit<Article, "id" | "createdAt">>,
  ): Promise<Article | null> {
    bustCache();
    const rows = await db
      .update(articlesTable)
      .set({
        ...(data.title         !== undefined && { title:         data.title }),
        ...(data.socialTitle   !== undefined && { socialTitle:   data.socialTitle }),
        ...(data.socialSummary  !== undefined && { socialSummary:  data.socialSummary }),
        ...(data.socialHashtags !== undefined && { socialHashtags: data.socialHashtags }),
        ...(data.subtitle      !== undefined && { subtitle:      data.subtitle }),
        ...(data.content       !== undefined && { content:       data.content }),
        ...(data.category      !== undefined && { category:      data.category }),
        ...(data.tag           !== undefined && { tag:           data.tag }),
        ...(data.imageUrl      !== undefined && { imageUrl:      data.imageUrl }),
        ...(data.author        !== undefined && { author:        data.author }),
        ...(data.publishedAt   !== undefined && { publishedAt:   new Date(data.publishedAt) }),
        ...(data.status        !== undefined && { status:        data.status }),
        ...(data.origin        !== undefined && { origin:        data.origin }),
        ...(data.rssSourceId   !== undefined && { rssSourceId:   data.rssSourceId }),
        ...(data.rssSourceName !== undefined && { rssSourceName: data.rssSourceName }),
        ...(data.rssSourceUrl  !== undefined && { rssSourceUrl:  data.rssSourceUrl }),
        ...(data.aiRewritten   !== undefined && { aiRewritten:   data.aiRewritten }),
        ...(data.slug          !== undefined && { slug:          data.slug }),
        ...(data.keywords      !== undefined && { keywords:      data.keywords }),
        ...(data.draftReason   !== undefined && { draftReason:   data.draftReason }),
        ...(data.canonicalUrl  !== undefined && { canonicalUrl:  data.canonicalUrl }),
        updatedAt: new Date(),
      })
      .where(eq(articlesTable.id, id))
      .returning();

    return rows[0] ? rowToArticle(rows[0]) : null;
  },

  async deleteArticle(id: string): Promise<boolean> {
    bustCache();
    const rows = await db
      .delete(articlesTable)
      .where(eq(articlesTable.id, id))
      .returning({ id: articlesTable.id });
    return rows.length > 0;
  },

  /**
   * Prévia da limpeza automática: quantos artigos seriam excluídos com a regra
   * atual, sem apagar nada. `count` já considera o teto `maxPerRun`; `total` é o
   * nº de artigos no banco. `cutoff` é a data-limite (ISO) aplicada.
   */
  async getRetentionStats(
    opts: RetentionOptions,
  ): Promise<{ count: number; total: number; cutoff: string; days: number; scope: RetentionScope }> {
    const { where, effDays, cutoff } = await buildRetentionWhere(opts);
    const [matched, totalRow] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(articlesTable).where(where),
      db.select({ n: sql<number>`count(*)::int` }).from(articlesTable),
    ]);
    let count = matched[0]?.n ?? 0;
    const cap = toNonNegInt(opts.maxPerRun);
    if (cap > 0) count = Math.min(count, cap);
    return {
      count,
      total: totalRow[0]?.n ?? 0,
      cutoff: cutoff.toISOString(),
      days: effDays,
      scope: opts.scope,
    };
  },

  /**
   * Exclui os artigos que atendem à regra de retenção (idade + proteções).
   * Respeita o teto `maxPerRun` removendo primeiro os mais antigos. Retorna o
   * nº de artigos removidos.
   */
  async purgeOlderThan(opts: RetentionOptions): Promise<number> {
    bustCache();
    const { where } = await buildRetentionWhere(opts);
    const cap = toNonNegInt(opts.maxPerRun);

    if (cap > 0) {
      const candidates = await db
        .select({ id: articlesTable.id })
        .from(articlesTable)
        .where(where)
        .orderBy(AGE_EXPR) // mais antigos primeiro
        .limit(cap);
      if (candidates.length === 0) return 0;
      const rows = await db
        .delete(articlesTable)
        .where(inArray(articlesTable.id, candidates.map((c) => c.id)))
        .returning({ id: articlesTable.id });
      return rows.length;
    }

    const rows = await db
      .delete(articlesTable)
      .where(where)
      .returning({ id: articlesTable.id });
    return rows.length;
  },

  /** Import articles from store.json array (startup migration) */
  async migrateFromStore(articles: Article[]): Promise<number> {
    if (!articles.length) return 0;

    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(articlesTable);
    if ((count[0]?.n ?? 0) > 0) return 0; // already migrated

    let imported = 0;
    for (const a of articles) {
      try {
        await db.insert(articlesTable).values({
          id:            a.id,
          title:         a.title,
          subtitle:      a.subtitle ?? "",
          content:       a.content ?? "",
          category:      a.category ?? "geral",
          tag:           a.tag ?? "GERAL",
          imageUrl:      a.imageUrl ?? "",
          author:        a.author ?? "Redação",
          publishedAt:   a.publishedAt ? new Date(a.publishedAt) : new Date(),
          status:        a.status ?? "draft",
          origin:        a.origin,
          rssSourceId:   a.rssSourceId,
          rssSourceName: a.rssSourceName,
          rssSourceUrl:  a.rssSourceUrl,
          aiRewritten:   a.aiRewritten ?? false,
          slug:          a.slug,
          keywords:      a.keywords,
          createdAt:     a.createdAt ? new Date(a.createdAt) : new Date(),
          updatedAt:     a.updatedAt ? new Date(a.updatedAt) : new Date(),
        }).onConflictDoNothing();
        imported++;
      } catch { /* skip individual failures */ }
    }
    return imported;
  },
};
