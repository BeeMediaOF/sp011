import { Router } from "express";
import type { PromptsBlob } from "@workspace/news-engine";
import { authMiddleware } from "../middlewares/auth.js";
import { getPrompts, getSettings, savePrompts, saveSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logEvent } from "../lib/eventLog.js";

const router = Router();
router.use(authMiddleware);

/** Resposta pública: nunca devolve segredos, só flags/hints. */
function maskSettings(s: HubSettings) {
  const { openaiApiKey, geminiApiKeys, ...rest } = s;
  return {
    ...rest,
    hasOpenaiKey: !!openaiApiKey,
    geminiKeyHints: (geminiApiKeys ?? []).map((k) => `...${k.slice(-4)}`),
  };
}

router.get("/", (_req, res) => {
  res.json(maskSettings(getSettings()));
});

router.put("/", async (req, res) => {
  const body = (req.body ?? {}) as Partial<HubSettings> & { hasOpenaiKey?: unknown; geminiKeyHints?: unknown };
  // Campos derivados/mascarados nunca entram no merge
  delete body.hasOpenaiKey;
  delete body.geminiKeyHints;
  // Chaves Gemini só mudam pelas rotas dedicadas
  delete (body as Record<string, unknown>)["geminiApiKeys"];
  // openaiApiKey: só sobrescreve quando enviada não-vazia
  if (!body.openaiApiKey) delete body.openaiApiKey;

  const updated = await saveSettings(body);
  logEvent({ module: "api", message: "Configurações do hub atualizadas" });
  res.json(maskSettings(updated));
});

router.post("/gemini-keys", async (req, res) => {
  const { key } = (req.body ?? {}) as { key?: string };
  const trimmed = key?.trim();
  if (!trimmed) {
    res.status(400).json({ error: "key é obrigatória." });
    return;
  }
  const s = getSettings();
  if ((s.geminiApiKeys ?? []).includes(trimmed)) {
    res.status(409).json({ error: "Chave já cadastrada." });
    return;
  }
  const updated = await saveSettings({ geminiApiKeys: [...(s.geminiApiKeys ?? []), trimmed] });
  logEvent({ module: "api", message: `Chave Gemini adicionada (...${trimmed.slice(-4)})` });
  res.json(maskSettings(updated));
});

router.delete("/gemini-keys/:hint", async (req, res) => {
  const hint = req.params.hint.replace(/^\.+/, ""); // aceita "abcd" ou "...abcd"
  const s = getSettings();
  const remaining = (s.geminiApiKeys ?? []).filter((k) => !k.endsWith(hint));
  if (remaining.length === (s.geminiApiKeys ?? []).length) {
    res.status(404).json({ error: "Nenhuma chave termina com esse sufixo." });
    return;
  }
  const updated = await saveSettings({ geminiApiKeys: remaining });
  logEvent({ module: "api", message: `Chave Gemini removida (...${hint})` });
  res.json(maskSettings(updated));
});

router.get("/ai-quota", (_req, res) => {
  res.json(getGeminiPool().quotaStatus());
});

router.get("/prompts", (_req, res) => {
  res.json(getPrompts());
});

router.put("/prompts", async (req, res) => {
  const body = (req.body ?? {}) as PromptsBlob;
  const saved = await savePrompts({ global: body.global, categories: body.categories });
  logEvent({ module: "api", message: "Prompts atualizados" });
  res.json(saved);
});

export default router;
