/**
 * Rodízio de chaves Gemini — porte de `api-server/src/lib/rssProcessor.ts`
 * (callGeminiWithRotation + quota + cooldowns) para uma factory com estado
 * encapsulado, mais a captura de `usageMetadata` (TokenUsage) que o blog
 * nunca leu.
 *
 * Comportamento preservado do original:
 * - round-robin pulando chaves em cooldown;
 * - 429/quota → cooldown por chave (respeitando retryDelay do erro) e rotaciona;
 * - chave inválida/vazada/401/403 → "estacionada" por 30 min;
 * - 503/overload → retry na MESMA chave antes de rotacionar;
 * - todas indisponíveis → erro `QUOTA_COOLDOWN:` com cooldown global (teto 5 min);
 * - orçamento diário de REQUISIÇÕES (não tokens) com `QUOTA_EXHAUSTED:`.
 */
import { GoogleGenAI } from "@google/genai";
import { consoleLogger, type EngineLogger, type TokenUsage } from "../types.ts";

export const DEFAULT_DAILY_LIMIT = 1200;

/** Quanto tempo estacionar uma chave inválida/vazada para o rodízio pulá-la. */
const DEAD_KEY_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
/** Teto da pausa global quando todas as chaves estão indisponíveis. */
const MAX_GLOBAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

/**
 * True para erros que significam que ESTA chave está inutilizável (inválida,
 * vazada, proibida ou um token OAuth colado no lugar de API key) — em oposição
 * a um erro transitório de cota do qual a mesma chave se recupera.
 */
export function isKeyAuthError(msg: string): boolean {
  return (
    msg.includes("API key not valid") ||
    msg.includes("API_KEY_INVALID") ||
    msg.includes("reported as leaked") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("invalid authentication") ||
    msg.includes("Expected OAuth") ||
    /\b40[13]\b/.test(msg) // 401 Unauthorized / 403 Forbidden
  );
}

export function parseCooldownMs(errMsg: string): number {
  // Formatos variados: "retryDelay: 60s", "retry after 60s", "retry-after: 60", "Retry in 60 seconds"
  const m = errMsg.match(/(?:retryDelay|retry[\s-]*after|retry\s+in)[^\d]*(\d+(?:\.\d+)?)\s*s/i);
  if (m) return Math.ceil(parseFloat(m[1]!) * 1_000) + 8_000; // +8s de folga p/ janela de minuto
  return 70_000; // padrão: 70s (margem segura p/ reset de RPM do free tier)
}

/** Retry apenas para 503/overload — NÃO intercepta 429. */
async function withRetry503<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 5_000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const retryable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("overloaded") || msg.includes("high demand");
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw lastErr;
}

export interface GeminiPoolConfig {
  /** Accessor "vivo" das chaves — reflete edições no painel sem recriar o pool. */
  getKeys: () => string[];
  /** Limite diário de requisições (não tokens). Default 1200. */
  dailyLimit?: number;
  logger?: EngineLogger;
}

export interface GeminiCallResult {
  text: string;
  usage: TokenUsage;
}

export interface GeminiQuotaStatus {
  usedToday: number;
  dailyLimit: number;
  remaining: number;
  isQuotaExhausted: boolean;
  isOnCooldown: boolean;
  cooldownRemainingMs: number;
  cooldownUntil: number | null;
}

export interface GeminiPool {
  /** Chama o modelo com rodízio de chaves. Lança `QUOTA_COOLDOWN:`/`QUOTA_EXHAUSTED:`. */
  call(model: string, prompt: string): Promise<GeminiCallResult>;
  /** Quantas chaves estão fora de cooldown agora (mínimo 1 se houver chaves). */
  availableKeyCount(): number;
  quotaStatus(): GeminiQuotaStatus;
  /** Lança se cota diária estourada ou cooldown global ativo. */
  checkQuota(): void;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createGeminiPool(cfg: GeminiPoolConfig): GeminiPool {
  const logger = cfg.logger ?? consoleLogger;
  const dailyLimit = cfg.dailyLimit ?? DEFAULT_DAILY_LIMIT;

  /** Cooldown por chave: valor da chave → unix ms em que volta a ficar disponível */
  const keyCooldowns = new Map<string, number>();
  let roundRobin = 0;
  let quota = { dateKey: "", usedToday: 0, cooldownUntil: 0 };

  function refreshDay(): void {
    const today = todayKey();
    if (quota.dateKey !== today) {
      quota = { dateKey: today, usedToday: 0, cooldownUntil: 0 };
    }
  }

  function pickKey(keys: string[]): string | null {
    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const idx = (roundRobin + i) % keys.length;
      const key = keys[idx]!;
      if ((keyCooldowns.get(key) ?? 0) <= now) {
        roundRobin = (idx + 1) % keys.length;
        return key;
      }
    }
    return null; // todas em cooldown
  }

  function checkQuota(): void {
    refreshDay();
    const now = Date.now();
    if (now < quota.cooldownUntil) {
      const secs = Math.ceil((quota.cooldownUntil - now) / 1_000);
      throw new Error(`QUOTA_COOLDOWN:Limite de requisições atingido. Aguardando ${secs}s antes de chamar a IA novamente.`);
    }
    if (quota.usedToday >= dailyLimit) {
      throw new Error(`QUOTA_EXHAUSTED:Limite diário de ${dailyLimit} requisições de IA atingido. Tente novamente amanhã.`);
    }
  }

  function availableKeyCount(): number {
    const keys = cfg.getKeys();
    if (keys.length === 0) return 0;
    const now = Date.now();
    const available = keys.filter((k) => (keyCooldowns.get(k) ?? 0) < now).length;
    return Math.max(1, available); // sempre ao menos 1 para a fila progredir
  }

  function quotaStatus(): GeminiQuotaStatus {
    refreshDay();
    const now = Date.now();
    const cooldownRemainingMs = Math.max(0, quota.cooldownUntil - now);
    return {
      usedToday: quota.usedToday,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - quota.usedToday),
      isQuotaExhausted: quota.usedToday >= dailyLimit,
      isOnCooldown: cooldownRemainingMs > 0,
      cooldownRemainingMs,
      cooldownUntil: quota.cooldownUntil || null,
    };
  }

  async function call(model: string, prompt: string): Promise<GeminiCallResult> {
    checkQuota();
    const keys = cfg.getKeys();
    if (keys.length === 0) {
      throw new Error("Nenhuma API key do Gemini configurada.");
    }

    const tried = new Set<string>();

    while (tried.size < keys.length) {
      const available = keys.filter((k) => !tried.has(k));
      const key = pickKey(available);
      if (!key) break; // as restantes estão em cooldown

      tried.add(key);

      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const result = await withRetry503(async () => {
          const resp = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 8192 },
          });
          const um = resp.usageMetadata;
          const usage: TokenUsage = {
            provider: "gemini",
            model,
            keyHint: key.slice(-4),
            inputTokens: um?.promptTokenCount,
            outputTokens: um?.candidatesTokenCount,
            totalTokens: um?.totalTokenCount,
          };
          return { text: resp.text ?? "", usage };
        });
        quota.usedToday++;
        return result;
      } catch (err) {
        const msg = String(err);
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          const cooldownMs = parseCooldownMs(msg);
          keyCooldowns.set(key, Date.now() + cooldownMs);
          logger.warn(
            { keyHint: `...${key.slice(-4)}`, cooldownMs, remaining: keys.length - tried.size },
            "Gemini 429 — rotacionando para a próxima chave",
          );
          continue;
        }
        if (isKeyAuthError(msg)) {
          keyCooldowns.set(key, Date.now() + DEAD_KEY_COOLDOWN_MS);
          logger.warn(
            { keyHint: `...${key.slice(-4)}`, remaining: keys.length - tried.size },
            "Chave Gemini inválida/vazada — estacionando e rotacionando",
          );
          continue;
        }
        throw err; // erro genuíno (não cota, não auth): propaga imediatamente
      }
    }

    // Todas as chaves tentadas ou em cooldown — calcula quando a primeira volta
    const now = Date.now();
    const cooldownTimes = keys.map((k) => keyCooldowns.get(k) ?? 0);
    const minCooldown = Math.min(...cooldownTimes);
    const waitSecs = Math.max(0, Math.ceil((minCooldown - now) / 1_000));
    const rawCooldownMs = waitSecs > 0 ? waitSecs * 1_000 + 8_000 : 70_000;
    const globalCooldownMs = Math.min(rawCooldownMs, MAX_GLOBAL_COOLDOWN_MS);
    quota.cooldownUntil = now + globalCooldownMs;
    const waitDisplay = Math.ceil(globalCooldownMs / 1_000);
    throw new Error(
      `QUOTA_COOLDOWN:Todas as ${keys.length} API key(s) do Gemini estão indisponíveis (cota ou chave inválida). Aguardando ${waitDisplay}s.`,
    );
  }

  return { call, availableKeyCount, quotaStatus, checkQuota };
}
