import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Exclusivamente CENTRAL_DATABASE_URL — sem fallback para as variáveis do blog
// (SUPABASE_DATABASE_URL/DATABASE_URL), para nunca conectar no banco errado.
const connectionString = process.env.CENTRAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "CENTRAL_DATABASE_URL must be set (banco do painel central). " +
      "Não há fallback proposital para as variáveis do blog.",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
export * from "./schema";
