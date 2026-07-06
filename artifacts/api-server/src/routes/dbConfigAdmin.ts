/**
 * Troca de banco pós-instalação (Configurações → Banco de Dados) — admin only.
 *
 *   GET  /api/admin/db-config         → status mascarado (origem, host, banco)
 *   POST /api/admin/db-config/test    → testa o banco candidato
 *   POST /api/admin/db-config/apply   → reautentica, valida, grava e reinicia
 *
 * Salvaguardas: origem env é somente-leitura (o arquivo perderia para a env no
 * boot); reautenticação por senha do admin logado; o candidato é testado e
 * migrado ANTES de gravar; o arquivo anterior vira .bak (rollback manual);
 * restart controlado — o processo nunca troca de conexão a quente.
 */
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { createStandaloneDb, db, usersTable } from "@workspace/db";
import { authMiddleware, requireAdmin, verifyPassword } from "../middlewares/auth.js";
import {
  dbConfigPath,
  describeDbError,
  readDbConfigFile,
  resolveDbBoot,
  writeDbConfigFile,
  type StoredDbConfig,
} from "../lib/dbConfig.js";
import { encryptionAvailable } from "../lib/crypto.js";
import { ensureSchema } from "../lib/ensureSchema.js";
import { logAudit } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import {
  applyBaseline,
  connectionFromBody,
  probeCandidate,
  verifyTables,
} from "./setup.js";

const router: IRouter = Router();
router.use(authMiddleware);
router.use(requireAdmin);

/** Host/banco extraídos SEM credenciais — nunca devolver usuário/senha. */
function describeConnection(connectionString: string): {
  provider: "supabase" | "postgres";
  host: string;
  database: string;
  ssl: boolean;
} {
  try {
    const u = new URL(connectionString);
    const host = u.hostname;
    return {
      provider: /\.supabase\.(co|com)$/.test(host) ? "supabase" : "postgres",
      host,
      database: u.pathname.replace(/^\//, "") || "?",
      ssl: /sslmode=(require|no-verify|verify-full|verify-ca)/.test(u.search),
    };
  } catch {
    return { provider: "postgres", host: "?", database: "?", ssl: false };
  }
}

router.get("/", (_req, res) => {
  const boot = resolveDbBoot();
  if (boot.source === "env" || boot.source === "file") {
    res.json({
      source: boot.source,
      ...describeConnection(boot.connectionString),
      canManage: boot.source === "file" && encryptionAvailable(),
      encryptionAvailable: encryptionAvailable(),
    });
    return;
  }
  // instalado mas resolução falhou agora (arquivo sumiu/corrompeu depois do boot)
  res.json({
    source: boot.source,
    error: boot.source === "file-error" ? boot.error : null,
    canManage: false,
    encryptionAvailable: encryptionAvailable(),
  });
});

router.post("/test", async (req, res) => {
  const connectionString = connectionFromBody(req.body ?? {});
  if (!connectionString) {
    res.status(400).json({ ok: false, error: "Informe a connection string ou os campos de conexão." });
    return;
  }
  const { pool } = createStandaloneDb(connectionString);
  try {
    const probe = await probeCandidate(pool);
    res.json({ ok: true, ...probe });
  } catch (err) {
    res.json({ ok: false, error: describeDbError(err) });
  } finally {
    await pool.end().catch(() => {});
  }
});

router.post("/apply", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const boot = resolveDbBoot();
  if (boot.source === "env") {
    res.status(409).json({
      ok: false,
      error:
        "A conexão está definida por variável de ambiente (SUPABASE_DATABASE_URL/DATABASE_URL) — remova a env para gerenciar o banco pela interface.",
    });
    return;
  }
  if (!encryptionAvailable()) {
    res.status(400).json({
      ok: false,
      error: "SETTINGS_ENCRYPTION_KEY não definida — a troca não grava credenciais em texto puro.",
    });
    return;
  }

  // Reautenticação: senha atual do admin logado (ação de alto impacto).
  const currentPassword = typeof body["currentPassword"] === "string" ? body["currentPassword"] : "";
  const [me] = await db
    .select({ id: usersTable.id, email: usersTable.email, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId ?? -1));
  if (!me || !verifyPassword(currentPassword, me.passwordHash)) {
    res.status(401).json({ ok: false, error: "Senha atual incorreta — reautenticação necessária." });
    return;
  }

  const connectionString = connectionFromBody(body);
  if (!connectionString) {
    res.status(400).json({ ok: false, error: "Informe a connection string ou os campos de conexão." });
    return;
  }

  const { pool, db: candidateDb } = createStandaloneDb(connectionString);
  try {
    const probe = await probeCandidate(pool);
    if (!probe.canCreate) {
      res.json({ ok: false, error: "O usuário do banco não tem permissão de CREATE no schema public." });
      return;
    }

    // Banco vazio: prepara o schema e copia o admin atual para não perder o
    // login após o restart. Banco com dados: assume dump/restore já feito.
    if (!probe.hasExistingInstall) {
      await applyBaseline(candidateDb);
    }
    await ensureSchema(candidateDb);
    const missing = await verifyTables(pool);
    if (missing.length > 0) {
      res.json({ ok: false, error: `Migração incompleta — tabelas ausentes: ${missing.join(", ")}.` });
      return;
    }
    const [{ count }] = await candidateDb
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);
    if (count === 0) {
      const [current] = await db.select().from(usersTable).where(eq(usersTable.id, me.id));
      if (current) {
        await candidateDb.insert(usersTable).values({
          name: current.name,
          email: current.email,
          passwordHash: current.passwordHash,
          role: "admin",
          status: "active",
          mustChangePassword: 0,
        });
      }
    }

    // Preserva o storage configurado no arquivo atual (a troca é só do banco).
    let previous: Partial<StoredDbConfig> = {};
    try {
      previous = readDbConfigFile();
    } catch {
      // arquivo ilegível — segue sem os campos de storage
    }
    const config: StoredDbConfig = {
      v: 1,
      connectionString,
      ...(previous.supabaseUrl ? { supabaseUrl: previous.supabaseUrl } : {}),
      ...(previous.supabaseServiceRoleKey
        ? { supabaseServiceRoleKey: previous.supabaseServiceRoleKey }
        : {}),
      ...(previous.supabaseStorageBucket
        ? { supabaseStorageBucket: previous.supabaseStorageBucket }
        : {}),
    };
    writeDbConfigFile(config);

    await logAudit({
      userId: me.id,
      userEmail: me.email,
      action: "db_config_change",
      module: "settings",
      description: `Troca de banco de dados para ${describeConnection(connectionString).host} — reinício controlado (backup em ${dbConfigPath()}.bak).`,
      ipAddress: req.ip,
    });
    logger.warn({ host: describeConnection(connectionString).host }, "Troca de banco aplicada — reiniciando.");
    res.json({ ok: true, restarting: true, wasEmpty: !probe.hasExistingInstall });

    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    logger.error({ err }, "Falha na troca de banco");
    res.status(500).json({ ok: false, error: describeDbError(err) });
  } finally {
    await pool.end().catch(() => {});
  }
});

export default router;
