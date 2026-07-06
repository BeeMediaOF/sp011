/**
 * Estado do modo instalação, decidido UMA vez no boot (index.ts) antes do
 * listen. Enquanto `required`, o app serve apenas /api/setup/* — todo o resto
 * responde 503 { setupRequired: true } e o frontend redireciona p/ /admin/setup.
 *
 * O setup token protege o assistente numa instância recém-exposta: é gerado no
 * boot, impresso UMA vez no log do container e exigido em toda ação do wizard.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export type SetupMode =
  | { required: false }
  | { required: true; reason: "not_configured" | "recovery"; error?: string };

// Começa "exigindo instalação" até o boot decidir — nenhuma rota fica aberta
// por corrida entre o listen e a resolução da conexão.
let _mode: SetupMode = { required: true, reason: "not_configured" };
let _token: string | null = null;

export function setSetupMode(mode: SetupMode): void {
  _mode = mode;
}

export function getSetupMode(): SetupMode {
  return _mode;
}

export function isDbReady(): boolean {
  return !_mode.required;
}

/** Gera (uma vez) e devolve o token do assistente — para imprimir no log. */
export function ensureSetupToken(): string {
  if (!_token) _token = randomBytes(16).toString("hex");
  return _token;
}

export function verifySetupToken(candidate: unknown): boolean {
  if (!_token || typeof candidate !== "string" || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(_token);
  return a.length === b.length && timingSafeEqual(a, b);
}
