/**
 * Deduplicação central — mesmo desenho do `articleService.isDuplicateArticle`
 * do blog: match exato via SQL (guid / URL original / título normalizado) +
 * sobreposição de palavras nos últimos 500 títulos (news-engine/dedup).
 */
import { db, newsItemsTable } from "@workspace/central-db";
import { normalizeTitle, titleOverlap, OVERLAP_THRESHOLD } from "@workspace/news-engine";
import { desc, eq, or, type SQL } from "drizzle-orm";

export async function isDuplicateNews(input: {
  title: string;
  guid?: string;
  url?: string;
}): Promise<boolean> {
  const conditions: SQL[] = [eq(newsItemsTable.titleNorm, normalizeTitle(input.title))];
  if (input.guid) conditions.push(eq(newsItemsTable.guid, input.guid));
  if (input.url) conditions.push(eq(newsItemsTable.originalUrl, input.url));

  const exact = await db
    .select({ id: newsItemsTable.id })
    .from(newsItemsTable)
    .where(or(...conditions))
    .limit(1);
  if (exact.length > 0) return true;

  const recent = await db
    .select({ title: newsItemsTable.title })
    .from(newsItemsTable)
    .orderBy(desc(newsItemsTable.createdAt))
    .limit(500);

  return recent.some((r) => titleOverlap(input.title, r.title) >= OVERLAP_THRESHOLD);
}
