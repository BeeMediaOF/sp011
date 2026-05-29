import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/site — site settings (public) */
router.get("/site", (_req, res) => {
  const settings = store.getSettings();
  res.json(settings);
});

export default router;
