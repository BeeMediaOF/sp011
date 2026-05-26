import { Router } from "express";

const router = Router();

/** POST /api/messages — send contact message to support (public) */
router.post("/", (req, res) => {
  const { name, email, subject, message } = req.body as { name?: string; email?: string; subject?: string; message?: string };
  if (!name || !email || !message) {
    res.status(400).json({ ok: false, error: "name, email and message are required" }); return;
  }
  req.log.info({ name, email, subject }, "Contact message received");
  res.json({ ok: true, message: "Mensagem enviada com sucesso! Em breve entraremos em contato." });
});

export default router;
