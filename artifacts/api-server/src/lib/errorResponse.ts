/**
 * Saneamento de erro para o handler de erro global (PRD-13/CWE-209): resposta
 * JSON padronizada SEM `err.message`/`stack` em produção (o detalhe fica só no
 * log interno). Função PURA — testável sem Express.
 */
export function errorResponseBody(
  err: unknown,
  isProd: boolean,
  requestId?: string,
): { status: number; body: Record<string, unknown> } {
  const e = (err ?? {}) as {
    status?: number; statusCode?: number; type?: string; message?: string; stack?: string;
  };

  let status = 500;
  if (typeof e.status === "number") status = e.status;
  else if (typeof e.statusCode === "number") status = e.statusCode;
  else if (e.type === "entity.too.large") status = 413;
  else if (e.type === "entity.parse.failed") status = 400;
  // Erro do callback de CORS ("Origem ... não permitida"). Regex ASCII: casa
  // "permitida" (sem acento) ou "not allowed" (regra do repo: nada de unicode literal).
  else if (typeof e.message === "string" && /permitida|not allowed/i.test(e.message)) status = 403;

  const CODES: Record<number, string> = { 400: "bad_request", 403: "forbidden", 413: "payload_too_large" };
  const code = status >= 500 ? "internal_error" : (CODES[status] ?? "client_error");

  const body: Record<string, unknown> = { error: code };
  if (requestId) body["requestId"] = requestId;
  if (!isProd) {
    if (typeof e.message === "string") body["message"] = e.message;
    if (typeof e.stack === "string") body["stack"] = e.stack;
  }
  return { status, body };
}
