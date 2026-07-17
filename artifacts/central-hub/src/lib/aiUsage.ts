/**
 * Registro de chamadas de IA com FALHA em `ai_usage_events` (F2 dos PRDs).
 * Antes só o sucesso era medido — a taxa de erro por provider era invisível.
 * Compartilhado entre rewriter e localizer; métrica nunca derruba o fluxo.
 */
import { db, aiUsageEventsTable } from "@workspace/central-db";
import { isKeyAuthError } from "@workspace/news-engine";

/** Classe do erro p/ ai_usage_events.error_kind. */
export function classifyErrorKind(msg: string): string {
  if (msg.includes("QUOTA_COOLDOWN") || msg.includes("QUOTA_EXHAUSTED") || /\b429\b/.test(msg)) return "quota";
  if (isKeyAuthError(msg)) return "auth";
  if (/timeout|timed out|abort/i.test(msg)) return "timeout";
  return "other";
}

export async function logAiCallError(input: {
  newsItemId?: string | null;
  rewriteId?: string | null;
  provider: string;
  purpose: string;
  errorMessage: string;
  durationMs?: number;
}): Promise<void> {
  try {
    await db.insert(aiUsageEventsTable).values({
      newsItemId: input.newsItemId ?? null,
      rewriteId: input.rewriteId ?? null,
      provider: input.provider,
      purpose: input.purpose,
      ok: false,
      errorKind: classifyErrorKind(input.errorMessage),
      durationMs: input.durationMs ?? null,
    });
  } catch { /* nunca propaga */ }
}
