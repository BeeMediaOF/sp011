/**
 * Limpeza do histórico contaminado de analytics (idempotente — pode rodar de novo):
 *
 *  1. Remove eventos do painel admin (path /admin%): navegação de editor não é audiência.
 *  2. Remove o pageview genérico duplicado das páginas de artigo — até jul/2026 cada
 *     visita a artigo gravava 2 pageviews (um do roteador, um do trackArticle); fica o
 *     que tem article_id, cai o genérico disparado a ≤15s dele na mesma sessão/path.
 *  3. Zera geo_stats: o contador antigo somava "1 por IP novo por processo", não views.
 *     Com o código atual a tabela volta a crescer com semântica de pageview por cidade.
 *
 * Uso:  node lib/db/scripts/cleanup-analytics-history.mjs
 * Conexão: SUPABASE_DATABASE_URL / DATABASE_URL do ambiente ou do .env da raiz.
 */
import pg from "pg";
import { readFileSync } from "fs";

function connectionString() {
  const fromEnv = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const envFile = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  const m = envFile.match(/^\s*(?:SUPABASE_DATABASE_URL|DATABASE_URL)\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error("SUPABASE_DATABASE_URL não encontrada (env ou .env da raiz)");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const url = connectionString();
const pool = new pg.Pool({
  connectionString: url,
  ...(url.includes("supabase") ? { ssl: { rejectUnauthorized: false } } : {}),
});

const q = (text, params) => pool.query(text, params);

try {
  const before = await q(`
    SELECT
      count(*)::int                                                        AS total,
      count(*) FILTER (WHERE path LIKE '/admin%')::int                     AS admin_events,
      count(*) FILTER (WHERE type = 'pageview')::int                       AS pageviews
    FROM analytics_events
  `);
  console.log("Antes :", before.rows[0]);

  const delAdmin = await q(`DELETE FROM analytics_events WHERE path LIKE '/admin%'`);
  console.log(`1) Eventos do painel admin removidos: ${delAdmin.rowCount}`);

  const delDup = await q(`
    DELETE FROM analytics_events a
    USING analytics_events b
    WHERE a.type = 'pageview' AND a.article_id IS NULL
      AND b.type = 'pageview' AND b.article_id IS NOT NULL
      AND a.session_id = b.session_id
      AND a.path = b.path
      AND abs(extract(epoch FROM (a.ts - b.ts))) <= 15
  `);
  console.log(`2) Pageviews duplicados de artigo removidos: ${delDup.rowCount}`);

  const geoBefore = await q(`SELECT count(*)::int AS cidades, COALESCE(sum(views),0)::int AS views FROM geo_stats`);
  await q(`TRUNCATE geo_stats`);
  console.log(`3) geo_stats zerada (tinha ${geoBefore.rows[0].cidades} cidades / ${geoBefore.rows[0].views} "views" sem significado)`);

  const after = await q(`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE type = 'pageview')::int AS pageviews
    FROM analytics_events
  `);
  console.log("Depois:", after.rows[0]);
} finally {
  await pool.end();
}
