import { randomUUID } from "crypto";
import { eq, or, and, isNull, desc, sql } from "drizzle-orm";
import { db, articlesTable, type ArticleRow } from "@workspace/db";

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

export const articleService = {
  async getArticles(): Promise<Article[]> {
    const rows = await db
      .select()
      .from(articlesTable)
      .orderBy(desc(articlesTable.createdAt));
    return rows.map(rowToArticle);
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
      .orderBy(articlesTable.createdAt)
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
    const now = new Date();
    const id  = randomUUID();
    const slug = data.slug ?? slugify(data.title);

    const rows = await db
      .insert(articlesTable)
      .values({
        id,
        title:         data.title,
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
    const rows = await db
      .update(articlesTable)
      .set({
        ...(data.title         !== undefined && { title:         data.title }),
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
    const rows = await db
      .delete(articlesTable)
      .where(eq(articlesTable.id, id))
      .returning({ id: articlesTable.id });
    return rows.length > 0;
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
