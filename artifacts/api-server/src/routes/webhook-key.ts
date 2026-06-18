import { Router } from "express";
import { randomBytes } from "crypto";
import { authMiddleware, requireAdmin } from "../middlewares/auth.js";
import { store } from "../lib/store.js";
import { logAudit, getClientIp } from "../lib/audit.js";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

/** GET /api/admin/webhook-key */
router.get("/", (_req, res) => {
  const settings = store.getSettings();
  const key = settings.webhookApiKey ?? null;
  res.json({ apiKey: key });
});

/** POST /api/admin/webhook-key — generate a new permanent API key */
router.post("/", async (req, res) => {
  try {
    const newKey = randomBytes(32).toString("hex");
    store.updateSettings({ webhookApiKey: newKey });
    await logAudit({
      userId: req.userId,
      action: "regenerate_webhook_key",
      module: "webhook",
      description: "Chave de API do webhook regenerada",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
    });
    res.json({ apiKey: newKey });
  } catch (err) {
    req.log.error({ err }, "Error generating webhook key");
    res.status(500).json({ error: "Erro ao gerar chave de API" });
  }
});

export default router;
