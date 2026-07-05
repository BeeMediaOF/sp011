/**
 * Pool Gemini único do processo, com accessor "vivo" das chaves do store
 * (edições no painel valem sem reiniciar; o limite diário exige restart).
 */
import { createGeminiPool, type GeminiPool } from "@workspace/news-engine";
import { getSettings } from "./store.js";
import { logger } from "./logger.js";

let _pool: GeminiPool | null = null;

export function getGeminiPool(): GeminiPool {
  if (!_pool) {
    _pool = createGeminiPool({
      getKeys: () => {
        const s = getSettings();
        const seen = new Set<string>();
        const keys: string[] = [];
        const add = (k?: string) => {
          const t = (k ?? "").trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            keys.push(t);
          }
        };
        add(process.env["GEMINI_API_KEY"]);
        for (const k of s.geminiApiKeys ?? []) add(k);
        return keys;
      },
      dailyLimit: getSettings().aiDailyLimit,
      logger,
    });
  }
  return _pool;
}
