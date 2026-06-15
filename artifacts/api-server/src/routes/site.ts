import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/site — site settings + menu items (public, sensitive keys excluded) */
router.get("/site", (_req, res) => {
  const { rssAiApiKey: _omit, ...settings } = store.getSettings();
  const menuItems = store.getMenuItems().filter((m) => m.visible);
  res.json({ ...settings, menuItems });
});

export default router;
