/**
 * Contrato PURO do nonce store (PRD-14) — sem `@workspace/db`, para ser
 * testável com `node --test`. A implementação em banco (`dbNonceStore`) vive em
 * `ingestNonce.ts` (que importa o db).
 */
export interface NonceStore {
  /** true = PRIMEIRA vez (inserido); false = já visto (replay). */
  consume(signature: string): Promise<boolean>;
}

/** Store em MEMÓRIA — mesma semântica do dbNonceStore, para testes/fallback. */
export function createMemoryNonceStore(): NonceStore {
  const seen = new Set<string>();
  return {
    async consume(signature: string): Promise<boolean> {
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    },
  };
}
