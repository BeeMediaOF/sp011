import { Router } from "express";
import { store } from "../lib/store";

const router = Router();

router.get("/", (_req, res) => {
  const columnists = store.getColumnists().filter((c) => c.active);
  res.json({ columnists });
});

router.get("/:id", (req, res) => {
  const c = store.getColumnist(req.params.id!);
  if (!c || !c.active) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ columnist: c });
});

export default router;
