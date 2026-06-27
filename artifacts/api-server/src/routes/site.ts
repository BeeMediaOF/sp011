import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/site — site settings + menu items (public, sensitive keys excluded) */
router.get("/site", (_req, res) => {
  const settings = store.getPublicSettings();
  const menuItems = store.getMenuItems().filter((m) => m.visible);
  res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=15");
  res.json({ ...settings, menuItems });
});

export default router;
