/**
 * Seleção JUSTA de entregas para o deliveryWorker: round-robin entre blogs em
 * vez de FIFO global por created_at.
 *
 * Por quê: o FIFO puro deixa um blog com backlog grande monopolizar o lote e
 * famintar os demais. Caso real (2026-07-21): KSports com 381 entregas
 * vencidas contra ~130 dos outros 7 blogs somados — sob FIFO o worker
 * despejava as 381 do KSports antes de servir qualquer outro. Isso é uma
 * "prioridade implícita" indesejada.
 *
 * Regra: cada blog entrega no máximo 1 por passada, começando por quem tem a
 * entrega mais antiga na frente (quem espera há mais tempo). Quando só sobra um
 * blog com fila, ele usa toda a capacidade do lote (degrada para FIFO daquele
 * blog). Função pura → testável sem banco.
 */
export interface FairItem {
  blogId: string;
  createdAt: Date;
}

export function selectFairBatch<T extends FairItem>(candidates: T[], batchSize: number): T[] {
  if (batchSize <= 0) return [];

  const byBlog = new Map<string, T[]>();
  for (const item of candidates) {
    const list = byBlog.get(item.blogId);
    if (list) list.push(item);
    else byBlog.set(item.blogId, [item]);
  }

  // Cada fila já chega ordenada por created_at (mais antigo primeiro). Ordena
  // os blogs pela idade da PRÓPRIA cabeça: quem tem a entrega mais antiga na
  // frente entra primeiro — sob contenção total, nenhum blog fica para trás.
  const queues = [...byBlog.values()].sort(
    (a, b) => a[0]!.createdAt.getTime() - b[0]!.createdAt.getTime(),
  );

  const out: T[] = [];
  let idx = 0;
  while (out.length < batchSize && queues.some((q) => q.length > 0)) {
    const q = queues[idx % queues.length]!;
    const next = q.shift();
    if (next) out.push(next);
    idx++;
  }
  return out;
}
