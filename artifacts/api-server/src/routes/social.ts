import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { store } from "../lib/store";

const router = Router();

const _dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "social-temp");
if (!existsSync(_dir)) mkdirSync(_dir, { recursive: true });

const _tempImages = new Map<string, { path: string; expires: number }>();

function getPublicBase(): string | null {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return null;
}

router.get("/config", (_req, res) => {
  const cfg = store.getSocialConfig();
  const masked = { ...cfg };
  if (masked.pageAccessToken && masked.pageAccessToken.length > 10) {
    masked.pageAccessToken = masked.pageAccessToken.slice(0, 6) + "••••••••" + masked.pageAccessToken.slice(-4);
  }
  res.json(masked);
});

router.post("/config", (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (typeof body["pageAccessToken"] === "string" && body["pageAccessToken"].includes("••")) {
    delete body["pageAccessToken"];
  }
  const cfg = store.updateSocialConfig(body);
  const masked = { ...cfg };
  if (masked.pageAccessToken && masked.pageAccessToken.length > 10) {
    masked.pageAccessToken = masked.pageAccessToken.slice(0, 6) + "••••••••" + masked.pageAccessToken.slice(-4);
  }
  res.json({ ok: true, config: masked });
});

router.get("/image/:token", (req, res) => {
  const entry = _tempImages.get(req.params["token"] ?? "");
  if (!entry || entry.expires < Date.now()) {
    _tempImages.delete(req.params["token"] ?? "");
    res.status(404).json({ error: "Not found or expired" });
    return;
  }
  if (!existsSync(entry.path)) {
    res.status(404).json({ error: "File missing" });
    return;
  }
  const buf = readFileSync(entry.path);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.send(buf);
});

router.post("/publish/:articleId", async (req, res) => {
  const { imageBase64, caption, storyCaption, publishFeed, publishStory, publishFacebook } =
    req.body as {
      imageBase64?: string;
      storyImageBase64?: string;
      caption?: string;
      storyCaption?: string;
      publishFeed?: boolean;
      publishStory?: boolean;
      publishFacebook?: boolean;
    };

  const cfg = store.getSocialConfig();

  if (!cfg.pageAccessToken) {
    res.status(400).json({ error: "Page Access Token não configurado" });
    return;
  }
  if (!cfg.instagramUserId && (publishFeed || publishStory)) {
    res.status(400).json({ error: "Instagram User ID não configurado" });
    return;
  }

  const base = getPublicBase();
  if (!base) {
    res.status(500).json({ error: "Não foi possível determinar a URL pública do servidor" });
    return;
  }

  if (!imageBase64) {
    res.status(400).json({ error: "Imagem não enviada" });
    return;
  }

  const token = randomUUID();
  const imgPath = join(_dir, `${token}.jpg`);
  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  writeFileSync(imgPath, Buffer.from(b64, "base64"));
  _tempImages.set(token, { path: imgPath, expires: Date.now() + 10 * 60 * 1000 });

  const imageUrl = `${base}/api/admin/social/image/${token}`;
  const results: Record<string, unknown> = {};
  const igId = cfg.instagramUserId;
  const pageId = cfg.facebookPageId;
  const accessToken = cfg.pageAccessToken;

  try {
    if (publishFeed && igId) {
      try {
        const cRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, caption: caption ?? "", access_token: accessToken }),
        });
        const c = (await cRes.json()) as { id?: string; error?: { message: string } };
        if (c.error) throw new Error(c.error.message);

        const pRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: c.id, access_token: accessToken }),
        });
        const p = (await pRes.json()) as { id?: string; error?: { message: string } };
        if (p.error) throw new Error(p.error.message);
        results["instagram_feed"] = { ok: true, id: p.id };
      } catch (e: unknown) {
        results["instagram_feed"] = { ok: false, error: (e as Error).message };
      }
    }

    if (publishStory && igId) {
      try {
        const cRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, media_type: "STORIES", access_token: accessToken }),
        });
        const c = (await cRes.json()) as { id?: string; error?: { message: string } };
        if (c.error) throw new Error(c.error.message);

        const pRes = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: c.id, access_token: accessToken }),
        });
        const p = (await pRes.json()) as { id?: string; error?: { message: string } };
        if (p.error) throw new Error(p.error.message);
        results["instagram_story"] = { ok: true, id: p.id };
      } catch (e: unknown) {
        results["instagram_story"] = { ok: false, error: (e as Error).message };
      }
    }

    if (publishFacebook && pageId) {
      try {
        const fRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: imageUrl, caption: caption ?? "", access_token: accessToken }),
        });
        const f = (await fRes.json()) as { id?: string; error?: { message: string } };
        if (f.error) throw new Error(f.error.message);
        results["facebook"] = { ok: true, id: f.id };
      } catch (e: unknown) {
        results["facebook"] = { ok: false, error: (e as Error).message };
      }
    }

    store.updateSocialConfig({ lastPublishedAt: new Date().toISOString() });
    res.json({ ok: true, results });
  } finally {
    setTimeout(() => {
      try { unlinkSync(imgPath); } catch {}
      _tempImages.delete(token);
    }, 5 * 60 * 1000);
  }
});

export default router;
