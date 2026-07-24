/**
 * adsDaily — lógica pura das métricas de anúncio (PRD 04), sem Express/Drizzle/I/O.
 *
 * Alvo direto dos testes `node --test` (test/adsDaily.test.ts, imports .ts).
 * Contém: o estimador do reparo histórico (RF2) e o dedup server-side em memória
 * (RF4). O SQL do reparo vive no ensureSchema; aqui fica só a matemática, para
 * poder ser provada contra o simulador do escritor legado.
 */

/**
 * Estimador do reparo (RF2). O escritor legado (INSERT-sempre + UPDATE-em-todas-as-
 * linhas do par) faz a PRIMEIRA linha de um campo valer N+1 para N eventos reais
 * serializados (dedução no PRD 04 §11), e 0 quando N=0. Logo o valor real é
 * `MAX(campo) - 1`, com piso 0. Validado contra produção (auditoria §9.1: 65 = 65
 * no anúncio "Start" do esporteagora, contra 1052 armazenadas). NÃO é idempotente:
 * reaplicar sobre dados já reparados decrementaria de novo — por isso a guarda do
 * reparo é a existência do índice único (§11).
 */
export function estimateRealCount(maxValue: number): number {
  return maxValue <= 0 ? 0 : maxValue - 1;
}

/**
 * Reparo de um par (ad_id, date): a partir das linhas duplicadas do escritor legado,
 * devolve a contagem real de impressões e cliques (cada campo pelo próprio MAX−1).
 * Par vazio → 0/0. Invariante verificável: nº de linhas do par = imp_reais + clk_reais
 * (cada evento legado inseriu exatamente 1 linha).
 */
export function repairPair(
  rows: ReadonlyArray<{ impressions: number; clicks: number }>,
): { impressions: number; clicks: number } {
  let maxImp = 0;
  let maxClk = 0;
  for (const r of rows) {
    if (r.impressions > maxImp) maxImp = r.impressions;
    if (r.clicks > maxClk) maxClk = r.clicks;
  }
  return { impressions: estimateRealCount(maxImp), clicks: estimateRealCount(maxClk) };
}

/**
 * Dedup server-side por chave (RF4). Guarda, por chave, o instante de EXPIRAÇÃO
 * (agora + janela). `isDuplicate` responde true se a chave ainda está viva (segunda
 * impressão/clique da mesma sessão+anúncio na janela) — nesse caso o chamador
 * responde ok sem gravar. Não desliza a janela: conta ~1× por janela por chave.
 *
 * O relógio é injetado (`now`) para os testes; o teto de chaves protege a memória
 * (ao exceder, descarta a mais antiga por ordem de inserção). `sweep` remove as
 * expiradas (varredura periódica no chamador). Zera no restart — mesma limitação
 * declarada do rate limit; observabilidade dos descartes é PRD 03/08.
 */
export class DedupStore {
  private readonly m = new Map<string, number>(); // chave -> expiraMs
  private readonly maxKeys: number;
  constructor(maxKeys = 50_000) {
    this.maxKeys = maxKeys;
  }

  isDuplicate(key: string, windowMs: number, now: number): boolean {
    const exp = this.m.get(key);
    if (exp !== undefined && exp > now) return true;
    // Fresca: (re)insere no fim para manter a ordem por recência (eviction FIFO).
    this.m.delete(key);
    this.m.set(key, now + windowMs);
    if (this.m.size > this.maxKeys) {
      const oldest = this.m.keys().next().value;
      if (oldest !== undefined) this.m.delete(oldest);
    }
    return false;
  }

  sweep(now: number): void {
    for (const [k, exp] of this.m) if (exp <= now) this.m.delete(k);
  }

  get size(): number {
    return this.m.size;
  }
}
