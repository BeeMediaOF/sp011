import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/ads — list active ads (public) */
router.get("/", (_req, res) => {
  const ads = store.getAds().filter((a) => a.active);
  res.json({ ads: ads.map((a) => ({ id: a.id, imageBase64: a.imageBase64, link: a.link, position: a.position })) });
});

/** POST /api/ads/:id/click — track click (public) */
router.post("/:id/click", (req, res) => {
  const ok = store.trackAdClick(req.params.id ?? "");
  if (!ok) { res.status(404).json({ ok: false, error: "Ad not found or inactive" }); return; }
  res.json({ ok: true, message: "Click tracked" });
});

/** POST /api/ads/:id/impression — track impression (public) */
router.post("/:id/impression", (req, res) => {
  store.trackAdImpression(req.params.id ?? "");
  res.json({ ok: true });
});

export default router;
