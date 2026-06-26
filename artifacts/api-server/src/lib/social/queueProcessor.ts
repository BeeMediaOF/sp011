import { randomUUID } from "crypto";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { socialPublicationQueueTable, socialAccountsTable, socialTemplatesTable, articlesTable } from "@workspace/db";
import { eq, and, lte, inArray } from "drizzle-orm";
import { generateArt } from "./imageGenerator.js";
import { logger } from "../logger.js";

const _dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "social-temp");
if (!existsSync(_dir)) mkdirSync(_dir, { recursive: true });

const _tempImages = new Map<string, { path: string; expires: number }>();

export function getPublicBase(): string | null {
  // Explicit public URL (production / VPS) takes precedence.
  const appUrl = process.env["APP_URL"] ?? process.env["PUBLIC_URL"];
  if (appUrl) return appUrl.replace(/\/+$/, "");
  // Replit-assigned domains (legacy / Replit hosting fallback).
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return null;
}

export function saveTempImage(buf: Buffer): { token: string; path: string } {
  const token = randomUUID();
  const imgPath = join(_dir, `${token}.jpg`);
  writeFileSync(imgPath, buf);
  _tempImages.set(token, { path: imgPath, expires: Date.now() + 15 * 60 * 1000 });
  return { token, path: imgPath };
}

export function getTempImage(token: string): { path: string } | null {
  const entry = _tempImages.get(token);
  if (!entry || entry.expires < Date.now()) {
    _tempImages.delete(token);
    return null;
  }
  if (!existsSync(entry.path)) return null;
  return { path: entry.path };
}

export function cleanupTempImage(token: string): void {
  const entry = _tempImages.get(token);
  if (entry) {
    try { unlinkSync(entry.path); } catch {}
    _tempImages.delete(token);
  }
}

async function postToMeta(
  url: string,
  params: Record<string, string>,
): Promise<{ id?: string; error?: { message: string } }> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    method: "POST",
    signal: AbortSignal.timeout(20000),
  });
  return res.json() as Promise<{ id?: string; error?: { message: string } }>;
}

async function publishItem(queueId: string): Promise<void> {
  // Mark as processing
  await db
    .update(socialPublicationQueueTable)
    .set({ status: "processing" })
    .where(eq(socialPublicationQueueTable.id, queueId));

  const [item] = await db
    .select()
    .from(socialPublicationQueueTable)
    .where(eq(socialPublicationQueueTable.id, queueId))
    .limit(1);

  if (!item) return;

  const [account] = await db
    .select()
    .from(socialAccountsTable)
    .where(eq(socialAccountsTable.id, item.socialAccountId))
    .limit(1);

  if (!account || !account.accessToken) {
    await db
      .update(socialPublicationQueueTable)
      .set({ status: "failed", errorMessage: "Conta não encontrada ou sem access token" })
      .where(eq(socialPublicationQueueTable.id, queueId));
    return;
  }

  const [article] = await db
    .select()
    .from(articlesTable)
    .where(eq(articlesTable.id, item.articleId))
    .limit(1);

  if (!article) {
    await db
      .update(socialPublicationQueueTable)
      .set({ status: "failed", errorMessage: "Artigo não encontrado" })
      .where(eq(socialPublicationQueueTable.id, queueId));
    return;
  }

  let imageToken: string | null = null;

  try {
    // Generate art if template is configured
    if (item.templateId) {
      const [template] = await db
        .select()
        .from(socialTemplatesTable)
        .where(eq(socialTemplatesTable.id, item.templateId))
        .limit(1);

      if (template) {
        const imgBuf = await generateArt(
          {
            width: template.width,
            height: template.height,
            backgroundColor: template.backgroundColor,
            elements: (template.elements as unknown[]) as import("./imageGenerator.js").TemplateElement[],
          },
          {
            title: article.title,
            category: article.category,
            imageUrl: article.imageUrl || undefined,
          },
        );
        const { token } = saveTempImage(imgBuf);
        imageToken = token;
      }
    }

    const base = getPublicBase();
    if (!base) throw new Error("URL pública não disponível");

    const imageUrl = imageToken
      ? `${base}/api/admin/social/image/${imageToken}`
      : article.imageUrl || "";

    if (!imageUrl) throw new Error("Sem imagem para publicar");

    const isStory = item.type === "story";
    const caption = item.caption ?? "";
    const token = account.accessToken;
    let metaPostId: string | undefined;

    if (account.instagramId) {
      // Instagram (feed or story)
      const mediaParams: Record<string, string> = {
        image_url: imageUrl,
        access_token: token,
        media_type: "IMAGE",
      };
      if (!isStory) mediaParams["caption"] = caption;
      if (isStory)  mediaParams["media_type"] = "STORIES";

      const container = await postToMeta(
        `https://graph.facebook.com/v20.0/${account.instagramId}/media`,
        mediaParams,
      );
      if (container.error) throw new Error(`IG container: ${container.error.message}`);
      if (!container.id) throw new Error("IG container: sem ID");

      // Small delay to allow media processing
      await new Promise((r) => setTimeout(r, 3000));

      const pub = await postToMeta(
        `https://graph.facebook.com/v20.0/${account.instagramId}/media_publish`,
        { creation_id: container.id, access_token: token },
      );
      if (pub.error) throw new Error(`IG publish: ${pub.error.message}`);
      metaPostId = pub.id;
    } else if (account.pageId) {
      // Facebook Page
      const endpoint = isStory
        ? `https://graph.facebook.com/v20.0/${account.pageId}/photo_stories`
        : `https://graph.facebook.com/v20.0/${account.pageId}/photos`;
      const params: Record<string, string> = { url: imageUrl, access_token: token };
      if (!isStory) params["caption"] = caption;
      const res = await postToMeta(endpoint, params);
      if (res.error) throw new Error(`FB: ${res.error.message}`);
      metaPostId = res.id;
    } else {
      throw new Error("Conta sem Page ID nem Instagram ID configurado");
    }

    await db
      .update(socialPublicationQueueTable)
      .set({
        status: "published",
        metaPostId: metaPostId ?? null,
        publishedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(socialPublicationQueueTable.id, queueId));

    logger.info({ queueId, metaPostId }, "Social: item publicado com sucesso");
  } catch (err) {
    const msg = (err as Error).message;
    const newRetry = (item.retryCount ?? 0) + 1;
    const nextStatus = newRetry < 3 ? "pending" : "failed";

    await db
      .update(socialPublicationQueueTable)
      .set({ status: nextStatus, errorMessage: msg, retryCount: newRetry })
      .where(eq(socialPublicationQueueTable.id, queueId));

    logger.warn({ queueId, err: msg, newRetry }, "Social: item falhou");
  } finally {
    if (imageToken) {
      setTimeout(() => cleanupTempImage(imageToken!), 5 * 60 * 1000);
    }
  }
}

export async function processSocialQueue(limit = 5): Promise<number> {
  const now = new Date();
  const pending = await db
    .select({ id: socialPublicationQueueTable.id })
    .from(socialPublicationQueueTable)
    .where(
      and(
        inArray(socialPublicationQueueTable.status, ["pending"]),
        lte(socialPublicationQueueTable.scheduledAt, now),
      ),
    )
    .orderBy(socialPublicationQueueTable.createdAt)
    .limit(limit);

  for (const { id } of pending) {
    try { await publishItem(id); } catch (e) { logger.error({ e }, "Queue processor outer error"); }
  }
  return pending.length;
}

let _cronStarted = false;

export function startSocialCron(): void {
  if (_cronStarted) return;
  _cronStarted = true;

  // Run every 5 minutes using setInterval (avoids node-cron import issues in ESM)
  const FIVE_MIN = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const count = await processSocialQueue(5);
      if (count > 0) logger.info({ count }, "Social queue: processados itens");
    } catch (err) {
      logger.error({ err }, "Social queue cron error");
    }
  }, FIVE_MIN);

  logger.info("Social queue cron iniciado (intervalo 5 min)");
}
