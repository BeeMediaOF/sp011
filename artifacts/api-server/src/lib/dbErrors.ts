/**
 * Classificação do erro de conexão com o banco. Módulo SEM imports de
 * propósito: é o que permite testá-lo com `node --test` sem arrastar o
 * `crypto.js` do dbConfig (o carregador de TS não resolve o `.js` do fonte).
 */

/**
 * Erro de conexão TRANSITÓRIO (o banco volta sozinho) x PERMANENTE (só o
 * operador conserta, informando outra conexão no assistente).
 *
 * Existe por causa de um incidente real (ksports, 2026-09-19): o `pg-blogs`
 * faz crash-recovery interno de vez em quando (CLAUDE.md §19.15, 4x em 11
 * dias) e leva ~1 min para aceitar conexão. Um blog que reiniciasse nessa
 * janela recebia `57P03 the database system is starting up`, era rebaixado a
 * "modo recuperação" e passava a servir o ASSISTENTE DE INSTALAÇÃO no lugar do
 * site — publicamente, até alguém perceber. Pior: o assistente convida a
 * digitar uma conexão, que sobrescreveria o `db-config.enc` bom.
 *
 * A lista PERMANENTE é fechada e curta de propósito; todo o resto conta como
 * transitório. O erro por omissão tem de ser o que se conserta sozinho: 503 com
 * nova tentativa a cada 15 s é uma falha limpa, enquanto expor o assistente no
 * lugar do site é uma falha que piora quanto mais tempo passa despercebida.
 */
const PERMANENT_DB_ERROR_CODES = new Set([
  "28P01", // invalid_password — senha trocada fora do assistente
  "28000", // invalid_authorization_specification (pg_hba/SSL)
  "3D000", // invalid_catalog_name — o banco não existe
  "42501", // insufficient_privilege — o REVOKE CONNECT pegou este usuário
]);

export function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  const code = typeof e?.code === "string" ? e.code : "";
  if (PERMANENT_DB_ERROR_CODES.has(code)) return false;

  // Credencial/catálogo errados às vezes chegam só na mensagem (drivers e
  // poolers variam) — sem isto, senha trocada esperaria para sempre.
  const msg = typeof e?.message === "string" ? e.message : String(err ?? "");
  if (/password authentication failed|role .* does not exist|database .* does not exist|permission denied for database/i.test(msg)) {
    return false;
  }
  return true;
}
