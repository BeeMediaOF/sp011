import { Router } from "express";
import { randomUUID } from "crypto";
import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();

const VAPID_PUBLIC  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"] ?? "";
const VAPID_SUBJECT = "mailto:contato@brasilia-agora.com.br";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

/** GET /api/push/vapid-public-key */
router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

/** POST /api/push/subscribe */
router.post("/subscribe", async (req, res) => {
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!endpoint) { res.status(400).json({ error: "endpoint obrigatório" }); return; }

  try {
    await db
      .insert(pushSubscriptionsTable)
      .values({ id: randomUUID(), endpoint, p256dh: keys?.p256dh ?? null, auth: keys?.auth ?? null })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push subscribe error");
    res.status(500).json({ error: "Erro ao salvar subscription" });
  }
});

/** DELETE /api/push/unsubscribe */
router.delete("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint obrigatório" }); return; }
  try {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push unsubscribe error");
    res.status(500).json({ error: "Erro ao remover subscription" });
  }
});

/** Send push notification to all subscribers */
export async function sendPushToAll(payload: { title: string; body: string; url: string }): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const subs = await db.select().from(pushSubscriptionsTable);
  const stale: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (!sub.p256dh || !sub.auth) return;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400 }
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) stale.push(sub.endpoint);
      }
    })
  );

  if (stale.length > 0) {
    await Promise.all(
      stale.map((ep) => db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, ep)))
    );
  }
}

export default router;
