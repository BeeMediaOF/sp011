/**
 * migrateJsonContent — startup idempotent migration
 *
 * Scans every article in the database and repairs those whose `content` field
 * is a raw JSON blob (possibly wrapped in a Markdown code fence).
 *
 * Detection (after .trim()):
 *   • starts with ``` (with or without "json" after the fence)
 *   • starts with { (bare JSON object without a fence)
 *
 * For each detected article:
 *   1. Strips the opening/closing code fence
 *   2. Attempts JSON.parse on the result
 *   3. Extracts content_html / contentHtml / content  +  title / subtitle / keywords / slug
 *   4. Writes the corrected values back to the DB
 *   If an individual article fails, it is logged and skipped — the rest continue.
 *
 * Idempotency: on a clean database (no broken articles) the function reads all
 * rows, detects zero candidates, and returns immediately without any writes.
 * Running it on every boot is safe.
 */

import { db, articlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Remove Markdown code fences and return the bare JSON string, or null. */
function stripFences(raw: string): string | null {
  // Hard-trim first so a leading \n before ``` doesn't defeat the ^ anchor
  const t = raw.trim();
  if (t.length < 10) return null;

  // Strip opening fence (```json, ```JSON, or plain ```)
  const afterOpen = t.replace(/^```(?:json)?\s*/i, "").trimStart();

  // After stripping any fence, the text must begin with { or [ to be JSON
  if (!afterOpen.startsWith("{") && !afterOpen.startsWith("[")) return null;

  // Strip closing fence if present
  return afterOpen.replace(/\s*```\s*$/, "").trim();
}

interface Extracted {
  content: string;
  title?: string;
  subtitle?: string;
  keywords?: string;
  slug?: string;
}

/** Parse the JSON string and extract the article fields. */
function extractFields(jsonStr: string): Extracted | null {
  // ── Attempt 1: clean JSON.parse ──────────────────────────────────────────
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const content = (
      (parsed["content_html"] as string | undefined) ??
      (parsed["contentHtml"]  as string | undefined) ??
      (parsed["content"]      as string | undefined) ?? ""
    ).trim();

    if (content.length > 20) {
      return {
        content,
        title:    ((parsed["title"]    as string | undefined) ?? "").trim() || undefined,
        subtitle: ((parsed["subtitle"] as string | undefined) ?? "").trim() || undefined,
        keywords: ((parsed["keywords"] as string | undefined) ?? "").trim() || undefined,
        slug:     ((parsed["slug"]     as string | undefined) ?? "").trim() || undefined,
      };
    }
  } catch { /* fall through */ }

  // ── Attempt 2: regex extraction (handles truncated JSON) ─────────────────
  for (const field of ["content_html", "contentHtml", "content"]) {
    // Matches the field value up to the next unescaped quote followed by , } or EOF
    const re = new RegExp(
      `"${field}"\\s*:\\s*"([\\s\\S]+?)(?:(?<!\\\\)"\\s*[,}]|(?<!\\\\)"\\s*$)`
    );
    const m = jsonStr.match(re);
    if (m?.[1]) {
      const content = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();

      if (content.length > 20) {
        const mTitle = jsonStr.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const mSub   = jsonStr.match(/"subtitle"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const mKw    = jsonStr.match(/"keywords"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const mSlug  = jsonStr.match(/"slug"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return {
          content,
          title:    mTitle?.[1]?.replace(/\\"/g, '"').trim() || undefined,
          subtitle: mSub?.[1]?.replace(/\\"/g, '"').trim()   || undefined,
          keywords: mKw?.[1]?.replace(/\\"/g, '"').trim()    || undefined,
          slug:     mSlug?.[1]?.replace(/\\"/g, '"').trim()  || undefined,
        };
      }
    }
  }

  return null;
}

// ─── main export ─────────────────────────────────────────────────────────────

export async function migrateJsonContent(): Promise<void> {
  let fixed   = 0;
  let failed  = 0;
  let skipped = 0;

  // Query directly — no in-memory cache, no status filter, no limit
  const rows = await db.select().from(articlesTable);

  for (const row of rows) {
    const trimmed = (row.content ?? "").trim();

    // Detection: fence-wrapped OR bare JSON object
    const looksRaw = trimmed.startsWith("```") || trimmed.startsWith("{");
    if (!looksRaw) { skipped++; continue; }

    const jsonStr = stripFences(trimmed);
    if (!jsonStr) { skipped++; continue; }

    const extracted = extractFields(jsonStr);
    if (!extracted) {
      logger.warn(
        { slug: row.slug ?? row.id },
        "Migration: could not extract content from JSON blob — skipping article"
      );
      failed++;
      continue;
    }

    try {
      await db
        .update(articlesTable)
        .set({
          content:  extracted.content,
          ...(extracted.title    ? { title:    extracted.title }    : {}),
          ...(extracted.subtitle ? { subtitle: extracted.subtitle } : {}),
          ...(extracted.keywords ? { keywords: extracted.keywords } : {}),
          ...(extracted.slug && row.slug !== extracted.slug ? { slug: extracted.slug } : {}),
          updatedAt: new Date(),
        })
        .where(eq(articlesTable.id, row.id));
      fixed++;
    } catch (err) {
      logger.warn(
        { err, slug: row.slug ?? row.id },
        "Migration: DB update failed for article — skipping"
      );
      failed++;
    }
  }

  const remainingBroken = rows.filter(r => {
    const t = (r.content ?? "").trim();
    return t.startsWith("```") || t.startsWith("{");
  }).length - fixed;

  logger.info(
    { fixed, failed, skipped, total: rows.length, remainingBroken: Math.max(0, remainingBroken) },
    "Migration: JSON-content repair complete"
  );
}
