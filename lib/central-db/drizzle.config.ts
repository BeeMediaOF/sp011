import { defineConfig } from "drizzle-kit";
import path from "path";

// Exclusivamente CENTRAL_DATABASE_URL — sem fallback para as variáveis do blog
// (SUPABASE_DATABASE_URL/DATABASE_URL), para nunca aplicar o schema central no
// banco errado por engano.
const connectionString = process.env.CENTRAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "CENTRAL_DATABASE_URL não definida — aponte para o banco do painel central.",
  );
}

export default defineConfig({
  // replace: path.join usa "\" no Windows e o glob do drizzle-kit trata "\" como escape
  schema: path.join(__dirname, "./src/schema/index.ts").replace(/\\/g, "/"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
