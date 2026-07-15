import { Router } from "express";
import authRouter from "./auth.js";
import blogsRouter from "./blogs.js";
import sourcesRouter from "./sources.js";
import settingsRouter from "./settings.js";
import newsRouter from "./news.js";
import rulesRouter from "./rules.js";
import deliveriesRouter from "./deliveries.js";
import usageRouter from "./usage.js";
import logsRouter from "./logs.js";
import statsRouter from "./stats.js";
import socialRouter from "./social.js";

const router = Router();

router.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "central-hub", ts: new Date().toISOString() });
});

router.use("/auth", authRouter);
router.use("/blogs", blogsRouter);
router.use("/sources", sourcesRouter);
router.use("/settings", settingsRouter);
router.use("/news", newsRouter);
router.use("/rules", rulesRouter);
router.use("/deliveries", deliveriesRouter);
router.use("/usage", usageRouter);
router.use("/logs", logsRouter);
router.use("/stats", statsRouter);
router.use("/social", socialRouter);

export default router;
