/**
 * Guards de recurso do render social (PRD-11, anti-DoS) — módulo PURO, sem
 * Playwright nem `@workspace/social-template`, para serem testáveis com
 * `node --test` (importar `renderTemplate.ts` puxa social-template, cujo barrel
 * tem import extensionless que quebra a resolução ESM do node).
 */
export const MAX_CONCURRENT_RENDERS = 2;    // teto de contextos Chromium simultâneos
export const RENDER_TIMEOUT_MS      = 20_000; // timeout GLOBAL de um render
export const RENDERS_BEFORE_RECYCLE = 200;  // recicla o browser p/ cap de memória

/** Executa `fn` com um timeout duro (rejeita se passar de `ms`). Função pura. */
export function runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`render timeout apos ${ms}ms`)), ms);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Semáforo de concorrência process-local.
let _activeRenders = 0;
const _renderWaiters: Array<() => void> = [];

export function acquireRenderSlot(): Promise<void> {
  if (_activeRenders < MAX_CONCURRENT_RENDERS) {
    _activeRenders++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => _renderWaiters.push(resolve));
}

export function releaseRenderSlot(): void {
  const next = _renderWaiters.shift();
  if (next) next(); // passa o slot adiante (mantém a contagem de ativos)
  else _activeRenders = Math.max(0, _activeRenders - 1);
}

export function activeRenderCount(): number {
  return _activeRenders;
}
