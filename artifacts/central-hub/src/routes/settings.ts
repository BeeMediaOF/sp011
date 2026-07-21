import { Router } from "express";
import type { PromptsBlob } from "@workspace/news-engine";
import { authMiddleware, requireCentralRole } from "../middlewares/auth.js";
import { getPrompts, getSettings, savePrompts, saveSettings, type HubSettings } from "../lib/store.js";
import { getGeminiPool } from "../lib/aiPool.js";
import { logEvent } from "../lib/eventLog.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

/** Resposta pública: nunca devolve segredos, só flags/hints. */
function maskSettings(s: HubSettings) {
  const {
    openaiApiKey, openaiApiKeys, geminiApiKeys, perplexityApiKey, perplexityApiKeys,
    apifyToken, apifyTokenBackup, metaAppSecret, bufferApiKey, ...rest
  } = s;
  return {
    ...rest,
    hasOpenaiKey: !!openaiApiKey,
    geminiKeyHints: (geminiApiKeys ?? []).map((k) => `...${k.slice(-4)}`),
    openaiKeyHints: (openaiApiKeys ?? []).map((k) => `...${k.slice(-4)}`),
    perplexityKeyHints: (perplexityApiKeys ?? []).map((k) => `...${k.slice(-4)}`),
    hasPerplexityKey: !!(perplexityApiKey || process.env["PERPLEXITY_API_KEY"]),
    hasApifyToken: !!apifyToken,
    hasApifyTokenBackup: !!apifyTokenBackup,
    hasMetaAppSecret: !!metaAppSecret,
    hasBufferApiKey: !!bufferApiKey,
  };
}

/** Pools de chave por provedor com rotas dedicadas (mesmo desenho do Gemini). */
const KEY_POOLS = {
  "gemini-keys":     { field: "geminiApiKeys" as const,     label: "Gemini" },
  "openai-keys":     { field: "openaiApiKeys" as const,     label: "OpenAI" },
  "perplexity-keys": { field: "perplexityApiKeys" as const, label: "Perplexity" },
};

router.get("/", (_req, res) => {
  res.json(maskSettings(getSettings()));
});

router.put("/", requireCentralRole("admin"), async (req, res) => {
  const body = (req.body ?? {}) as Partial<HubSettings> & {
    hasOpenaiKey?: unknown; geminiKeyHints?: unknown; openaiKeyHints?: unknown;
    perplexityKeyHints?: unknown; hasPerplexityKey?: unknown;
    hasApifyToken?: unknown; hasApifyTokenBackup?: unknown;
    hasMetaAppSecret?: unknown; hasBufferApiKey?: unknown;
  };
  // Campos derivados/mascarados nunca entram no merge
  delete body.hasOpenaiKey;
  delete body.geminiKeyHints;
  delete body.openaiKeyHints;
  delete body.perplexityKeyHints;
  delete body.hasPerplexityKey;
  delete body.hasApifyToken;
  delete body.hasApifyTokenBackup;
  delete body.hasMetaAppSecret;
  delete body.hasBufferApiKey;
  // Pools de chaves só mudam pelas rotas dedicadas
  for (const pool of Object.values(KEY_POOLS)) {
    delete (body as Record<string, unknown>)[pool.field];
  }
  // Chaves secretas: só sobrescrevem quando enviadas não-vazias
  if (!body.openaiApiKey) delete body.openaiApiKey;
  if (!body.perplexityApiKey) delete body.perplexityApiKey;
  if (!body.apifyToken) delete body.apifyToken;
  if (!body.apifyTokenBackup) delete body.apifyTokenBackup;
  if (!body.metaAppSecret) delete body.metaAppSecret;
  if (!body.bufferApiKey) delete body.bufferApiKey;

  const updated = await saveSettings(body);
  logEvent({ module: "api", message: "Configurações do hub atualizadas" });
  // Auditoria: só os NOMES das chaves alteradas, nunca os valores.
  logAudit(req, { action: "settings.update", targetType: "settings", meta: { changedKeys: Object.keys(body) } });
  res.json(maskSettings(updated));
});

// Pools de chaves (Gemini/OpenAI/Perplexity): adicionar e remover por sufixo.
// Rotas explícitas por pool (Express 5 não aceita mais regex em :param).
for (const [poolPath, pool] of Object.entries(KEY_POOLS)) {
  router.post(`/${poolPath}`, requireCentralRole("admin"), async (req, res) => {
    const { key } = (req.body ?? {}) as { key?: string };
    const trimmed = key?.trim();
    if (!trimmed) {
      res.status(400).json({ error: "key é obrigatória." });
      return;
    }
    const s = getSettings();
    const current = s[pool.field] ?? [];
    if (current.includes(trimmed)) {
      res.status(409).json({ error: "Chave já cadastrada." });
      return;
    }
    const updated = await saveSettings({ [pool.field]: [...current, trimmed] });
    logEvent({ module: "api", message: `Chave ${pool.label} adicionada (...${trimmed.slice(-4)})` });
    logAudit(req, { action: "ai_key.add", targetType: "ai_key", meta: { provider: pool.label, hint: `...${trimmed.slice(-4)}` } });
    res.json(maskSettings(updated));
  });

  router.delete(`/${poolPath}/:hint`, requireCentralRole("admin"), async (req, res) => {
    const hint = (req.params.hint as string).replace(/^\.+/, ""); // aceita "abcd" ou "...abcd"
    const s = getSettings();
    const current = s[pool.field] ?? [];
    const remaining = current.filter((k) => !k.endsWith(hint));
    if (remaining.length === current.length) {
      res.status(404).json({ error: "Nenhuma chave termina com esse sufixo." });
      return;
    }
    const updated = await saveSettings({ [pool.field]: remaining });
    logEvent({ module: "api", message: `Chave ${pool.label} removida (...${hint})` });
    logAudit(req, { action: "ai_key.remove", targetType: "ai_key", meta: { provider: pool.label, hint } });
    res.json(maskSettings(updated));
  });
}

router.get("/ai-quota", (_req, res) => {
  res.json(getGeminiPool().quotaStatus());
});

router.get("/prompts", (_req, res) => {
  res.json(getPrompts());
});

router.put("/prompts", requireCentralRole("admin"), async (req, res) => {
  const body = (req.body ?? {}) as PromptsBlob;
  const saved = await savePrompts({ global: body.global, categories: body.categories });
  logEvent({ module: "api", message: "Prompts atualizados" });
  logAudit(req, { action: "prompts.update", targetType: "settings" });
  res.json(saved);
});

export default router;
