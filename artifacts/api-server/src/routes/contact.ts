import { Router } from "express";
import { store } from "../lib/store.js";

const router = Router();

/** GET /api/columnists — list active columnists (public) */
router.get("/", (_req, res) => {
  const columnists = store.getColumnists().filter((c) => c.active);
  res.json({ columnists: columnists.map((c) => ({ id: c.id, name: c.name, bio: c.bio, avatarBase64: c.avatarBase64 })) });
});

export default router;
