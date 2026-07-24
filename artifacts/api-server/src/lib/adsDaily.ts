/**
 * adsDaily — lógica pura das métricas de anúncio (PRD 04), sem Express/Drizzle/I/O.
 *
 * Alvo direto dos testes `node --test` (test/adsDaily.test.ts, imports .ts).
 * Contém o estimador do reparo histórico (RF2). O SQL do reparo vive no ensureSchema;
 * aqui fica só a matemática, para poder ser provada contra o simulador do escritor
 * legado. O dedup server-side foi para trafficGuard.createDedupWindow (PRD 03 RF5).
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
