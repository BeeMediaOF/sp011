/**
 * Guardas PURAS da instalação (PRD-14) — sem I/O nem `@workspace/db`, para
 * serem testáveis com `node --test` (importar `setup.ts` puxa o db, cujo barrel
 * quebra a resolução ESM do node).
 */

/**
 * Decisão de adoção de banco existente. Endurece o adopt-guard: em produção,
 * adotar um banco com instalação existente exige `adoptExistingInstall:true` NO
 * corpo E `SETUP_ALLOW_ADOPT=true` no ambiente — a flag do corpo sozinha não
 * basta (evita colar a connection string errada e as duas instâncias editarem o
 * mesmo site — incidente ksports×sp011).
 */
export function adoptDecision(
  probe: { hasExistingInstall: boolean },
  body: Record<string, unknown>,
  env: { NODE_ENV?: string; SETUP_ALLOW_ADOPT?: string },
): { allow: boolean; reason?: string } {
  if (!probe.hasExistingInstall) return { allow: true };
  if (body["adoptExistingInstall"] !== true) return { allow: false, reason: "existing_install" };
  if (env.NODE_ENV === "production" && env.SETUP_ALLOW_ADOPT !== "true") {
    return { allow: false, reason: "adopt_needs_env_optin" };
  }
  return { allow: true };
}
