import { defineConfig } from "drizzle-kit";
import path from "path";

// `generate` (baseline de migrations) não precisa de banco; só o `push` usa a
// connection string — que então falha com mensagem clara se estiver ausente.
const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  // replace: path.join usa "\" no Windows e o glob do drizzle-kit trata "\" como escape
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  out: path.join(__dirname, "./migrations").replace(/\\/g, "/"),
  dialect: "postgresql",
  dbCredentials: {
    url:
      connectionString ??
      "postgresql://defina-SUPABASE_DATABASE_URL-ou-DATABASE_URL@localhost:5432/faltou-env",
  },
});
