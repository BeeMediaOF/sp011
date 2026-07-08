import { Router } from "express";
import { SITE_ASSET_FIELDS, store } from "../lib/store.js";

const router = Router();

/** GET /api/site-asset/:key — imagens das settings (logo, favicon, og…) como
 *  binário cacheável. O /api/site publica esses campos como URL com hash do
 *  conteúdo (?v=) em vez do data URI, então o browser cacheia como immutable
 *  e o JSON das settings fica pequeno. */
router.get("/site-asset/:key", (req, res) => {
  const field = SITE_ASSET_FIELDS[req.params.key as keyof typeof SITE_ASSET_FIELDS];
  const value = field ? store.getSettings()[field] : undefined;
  const m = typeof value === "string" ? /^data:([-\w.+/]+);base64,(.+)$/s.exec(value) : null;
  if (!m) { res.status(404).json({ error: "Asset não configurado." }); return; }
  res.setHeader("Content-Type", m[1]!);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(Buffer.from(m[2]!, "base64"));
});

/** GET /api/site — site settings + menu items (public, sensitive keys excluded) */
router.get("/site", (_req, res) => {
  const settings = { ...store.getPublicSettings() };
  // Templates de home são material do painel (aba Templates) — fora do payload público.
  delete settings.homeTemplates;
  const menuItems = store.getMenuItems()
    .filter((m) => m.visible)
    .map((m) => ({ ...m, children: m.children?.filter((c) => c.visible) }));
  // Subconjunto público do hub de Contato: rodapé (telefone/e-mail/redes) e
  // bloco "Redes Sociais" da home. supportEmail e textos legais ficam de fora.
  const c = store.getContactInfo();
  const contact = {
    displayEmail: c.displayEmail, phone: c.phone, whatsapp: c.whatsapp,
    facebook: c.facebook, instagram: c.instagram, x: c.x,
    youtube: c.youtube, tiktok: c.tiktok, address: c.address, cnpj: c.cnpj,
  };
  // no-cache: o navegador/Nginx sempre revalida antes de usar. Garante que edições
  // de blocos/menu/tema apareçam no site imediatamente (sem janela de cache servindo
  // estado antigo). O payload é pequeno e servido da memória do processo.
  res.setHeader("Cache-Control", "no-cache");
  res.json({ ...settings, menuItems, contact });
});

export default router;
