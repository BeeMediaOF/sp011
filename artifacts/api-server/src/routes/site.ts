import { Router } from "express";
import { SITE_ASSET_FIELDS, store } from "../lib/store.js";
import {
  cacheKey, memGet, resolveImage, MAX_WIDTH,
  type ImageFormat,
} from "../lib/imageTransform.js";

const router = Router();

/** GET /api/site-asset/:key — imagens das settings (logo, favicon, og…) como
 *  binário cacheável. O /api/site publica esses campos como URL com hash do
 *  conteúdo (?v=) em vez do data URI, então o browser cacheia como immutable
 *  e o JSON das settings fica pequeno.
 *
 *  Com `w`, redimensiona e converte para WebP LOSSLESS pelo MESMO pipeline do
 *  /api/image (`lib/imageTransform.ts`: cache em memória + disco e coalescing),
 *  no perfil `artwork`. Sem `w`, a resposta continua byte-idêntica à de antes —
 *  qualquer URL antiga em cache de navegador segue válida. */
router.get("/site-asset/:key", async (req, res) => {
  const field = SITE_ASSET_FIELDS[req.params.key as keyof typeof SITE_ASSET_FIELDS];
  const value = field ? store.getSettings()[field] : undefined;
  const m = typeof value === "string" ? /^data:([-\w.+/]+);base64,(.+)$/s.exec(value) : null;
  if (!m) { res.status(404).json({ error: "Asset não configurado." }); return; }

  const mimeIn = m[1]!;
  const rawW = req.query["w"];
  const rawH = req.query["h"];
  // SVG é vetor: escala sozinho no navegador e já é pequeno. Passar pelo sharp
  // só rasterizaria — perde a qualidade em telas 2x e costuma AUMENTAR o peso.
  const wants =
    (typeof rawW === "string" || typeof rawH === "string") && mimeIn !== "image/svg+xml";

  if (!wants) {
    res.setHeader("Content-Type", mimeIn);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(Buffer.from(m[2]!, "base64"));
    return;
  }

  /* `h` tem precedência: altura é a restrição de layout de uma logo (o CSS fixa
     `style={{ height }}` e deixa a largura livre), e só o servidor conhece a
     proporção para derivar a largura. `w` continua valendo para favicon e byline,
     que são quadrados e limitados pela caixa. */
  const h = typeof rawH === "string"
    ? Math.min(Math.max(parseInt(rawH, 10) || 0, 1), MAX_WIDTH)
    : undefined;
  const w = typeof rawW === "string"
    ? Math.min(Math.max(parseInt(rawW, 10) || 0, 1), MAX_WIDTH)
    : MAX_WIDTH;

  /* Perfil `artwork` (ver imageTransform.ts): compara WebP lossless com lossy
     q95/effort 4 e serve o menor. O perfil de foto — q82, effort 1 — deixava
     ringing visível em volta das letras da logo (KSports, 2026-07-28).
     `q`/`f` não entram na conta: o perfil decide os dois. O literal "artwork" e
     o `h` entram na chave para NÃO reaproveitar o que o cache em disco gravou no
     modo antigo. */
  const fmt: ImageFormat = "webp";
  const key = cacheKey(
    `site-asset:artwork:${req.params.key}:${value as string}`,
    h ? -h : w, 100, fmt,
  );
  const etag = `"${key.slice(0, 16)}"`;
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }

  const memHit = memGet(key);
  let processed: Buffer;
  try {
    processed = memHit ?? (await resolveImage(
      key, async () => Buffer.from(m[2]!, "base64"), w, 100, fmt, "artwork", h,
    ));
  } catch (err) {
    // Falha do sharp (formato exótico, imagem corrompida) não pode deixar o site
    // sem logo: cai para o binário cru, que é o comportamento legado.
    req.log.warn({ err, key: req.params.key }, "site-asset: transform falhou — servindo cru");
    res.setHeader("Content-Type", mimeIn);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(Buffer.from(m[2]!, "base64"));
    return;
  }

  res
    .set("Content-Type", "image/webp")
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .set("ETag", etag)
    .set("X-Image-Cache", memHit ? "MEM" : "MISS")
    .end(processed);
});

/** GET /api/site — site settings + menu items (public, sensitive keys excluded) */
router.get("/site", (_req, res) => {
  const settings = { ...store.getPublicSettings() };
  // Templates de home são material do painel (aba Templates) — fora do payload público.
  delete settings.homeTemplates;
  // IPs internos da redação são configuração de Analytics — vazariam ao público.
  delete settings.internalIps;
  // Campanhas pagas são configuração interna de Analytics (PRD 05) — não ao público.
  delete settings.paidCampaigns;
  const menuItems = store.getMenuItems()
    .filter((m) => m.visible)
    .map((m) => ({ ...m, children: m.children?.filter((c) => c.visible) }));
  // Subconjunto público do hub de Contato: rodapé (telefone/e-mail/redes) +
  // textos legais (Política de Privacidade/Termos/Info legal) e contato de
  // privacidade — todos exibidos publicamente nas páginas /privacidade, /termos
  // e /contato. supportEmail (interno) continua de fora.
  const c = store.getContactInfo();
  const contact = {
    displayEmail: c.displayEmail, phone: c.phone, whatsapp: c.whatsapp,
    facebook: c.facebook, instagram: c.instagram, x: c.x,
    youtube: c.youtube, tiktok: c.tiktok, address: c.address, cnpj: c.cnpj,
    legalInfo: c.legalInfo, privacyPolicy: c.privacyPolicy, termsOfUse: c.termsOfUse,
    privacyEmail: c.privacyEmail,
  };
  // no-cache: o navegador/Nginx sempre revalida antes de usar. Garante que edições
  // de blocos/menu/tema apareçam no site imediatamente (sem janela de cache servindo
  // estado antigo). O payload é pequeno e servido da memória do processo.
  res.setHeader("Cache-Control", "no-cache");
  res.json({ ...settings, menuItems, contact });
});

export default router;
