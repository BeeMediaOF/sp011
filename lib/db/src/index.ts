import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function createDb(p: pg.Pool) {
  return drizzle(p, { schema });
}

export type Db = ReturnType<typeof createDb>;

let _pool: pg.Pool | null = null;
let _db: Db | null = null;

/**
 * Inicializa a conexão do processo. Com a env definida isso acontece
 * automaticamente no import (o deploy atual permanece idêntico); sem env, o
 * api-server chama initDb() com a conexão vinda do arquivo criptografado do
 * assistente de instalação — ou nunca chama e o app fica em modo instalação.
 *
 * Trocar de banco depois de inicializado exige restart do processo (vários
 * módulos guardam cache/estado derivado do banco), por isso re-init é erro.
 */
export function initDb(connectionString: string): Db {
  if (_pool) {
    throw new Error(
      "initDb: conexão já inicializada neste processo — a troca de banco exige restart.",
    );
  }
  _pool = new Pool({ connectionString });
  _db = createDb(_pool);
  return _db;
}

export function isDbInitialized(): boolean {
  return _db !== null;
}

/**
 * Pool/drizzle AVULSOS, fora do singleton do processo — para o assistente de
 * instalação e a troca de banco testarem/prepararem um banco candidato sem
 * tocar na conexão corrente. O chamador deve encerrar com pool.end().
 */
export function createStandaloneDb(connectionString: string): {
  pool: pg.Pool;
  db: Db;
} {
  const p = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
  return { pool: p, db: createDb(p) };
}

function required<T>(value: T | null, what: string): T {
  if (!value) {
    throw new Error(
      `${what} usado antes de initDb() — banco não configurado (setupRequired). ` +
        "Defina SUPABASE_DATABASE_URL/DATABASE_URL ou conclua o assistente de instalação.",
    );
  }
  return value;
}

/**
 * Proxy que resolve a instância no primeiro ACESSO, não no import: os
 * consumidores continuam com `import { db, pool }` sem nenhuma mudança, e um
 * uso antes da inicialização falha com mensagem clara em vez de conectar em
 * lugar nenhum.
 */
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = get();
      const value = Reflect.get(instance as object, prop, instance);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(instance)
        : value;
    },
    has(_target, prop) {
      return prop in (get() as object);
    },
  });
}

export const pool: pg.Pool = lazy(() => required(_pool, "pool"));
export const db: Db = lazy(() => required(_db, "db"));

// Prioridade 1: env — comportamento idêntico ao deploy atual (conecta no import).
const envConnectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (envConnectionString) initDb(envConnectionString);

export * from "./schema";
