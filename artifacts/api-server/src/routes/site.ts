import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/site — site settings + menu items (public, sensitive keys excluded) */
router.get("/site", (_req, res) => {
  const settings = store.getPublicSettings();
  const menuItems = store.getMenuItems().filter((m) => m.visible);
  // no-cache: o navegador/Nginx sempre revalida antes de usar. Garante que edições
  // de blocos/menu/tema apareçam no site imediatamente (sem janela de cache servindo
  // estado antigo). O payload é pequeno e servido da memória do processo.
  res.setHeader("Cache-Control", "no-cache");
  res.json({ ...settings, menuItems });
});

export default router;
