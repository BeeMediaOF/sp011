/**
 * Deduplicação central — mesmo desenho do `articleService.isDuplicateArticle`
 * do blog: match exato via SQL (guid / URL original / título normalizado) +
 * sobreposição de palavras nos últimos 500 títulos (news-engine/dedup).
 */
import { db, newsItemsTable } from "@workspace/central-db";
import { normalizeTitle, titleOverlap, OVERLAP_THRESHOLD } from "@workspace/news-engine";
import { desc, eq, or, type SQL } from "drizzle-orm";

async function hasExactMatch(input: {
  title?: string;
  guid?: string;
  url?: string;
}): Promise<boolean> {
  const conditions: SQL[] = [];
  const norm = input.title ? normalizeTitle(input.title) : "";
  if (norm) conditions.push(eq(newsItemsTable.titleNorm, norm));
  if (input.guid) conditions.push(eq(newsItemsTable.guid, input.guid));
  if (input.url) conditions.push(eq(newsItemsTable.originalUrl, input.url));
  if (conditions.length === 0) return false;

  const exact = await db
    .select({ id: newsItemsTable.id })
    .from(newsItemsTable)
    .where(or(...conditions))
    .limit(1);
  return exact.length > 0;
}

async function recentTitles(): Promise<string[]> {
  const rows = await db
    .select({ title: newsItemsTable.title })
    .from(newsItemsTable)
    .orderBy(desc(newsItemsTable.createdAt))
    .limit(500);
  return rows.map((r) => r.title);
}

export async function isDuplicateNews(input: {
  title: string;
  guid?: string;
  url?: string;
}): Promise<boolean> {
  if (await hasExactMatch(input)) return true;
  const recent = await recentTitles();
  return recent.some((t) => titleOverlap(input.title, t) >= OVERLAP_THRESHOLD);
}

/**
 * Checker para varredura em lote (probe de vários itens de um feed ANTES do
 * scrape): tira UM snapshot dos 500 títulos recentes e o reusa em todas as
 * sondagens — só o match exato (indexado) vai ao banco por item. É um
 * pré-filtro: falso negativo custa um scrape à toa; quem decide na hora do
 * insert continua sendo o `isDuplicateNews`.
 */
export async function makeNewsDedupChecker(): Promise<
  (input: { title?: string; guid?: string; url?: string }) => Promise<boolean>
> {
  const recent = await recentTitles();
  return async (input) => {
    if (await hasExactMatch(input)) return true;
    if (!input.title) return false;
    const title = input.title;
    return recent.some((t) => titleOverlap(title, t) >= OVERLAP_THRESHOLD);
  };
}
