/**
 * Assistente de instalação (modo setup) — únicas rotas vivas quando o app sobe
 * sem banco configurado (sem env e sem /data/db-config.enc).
 *
 *   GET  /api/setup         → status público (setupRequired, motivo, criptografia)
 *   POST /api/setup/test    → testa um banco candidato (token obrigatório)
 *   POST /api/setup/apply   → migra + cria 1º admin + grava arquivo + restart
 *
 * Segurança: toda ação exige o setup token impresso UMA vez no log do container
 * no boot; instalada a instância, as ações respondem 403 (already_installed).
 * A connection string candidata nunca é logada nem devolvida em resposta.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { sql } from "drizzle-orm";
import { createStandaloneDb, usersTable, type Db } from "@workspace/db";
import baselineSql from "../../../../lib/db/migrations/0000_init.sql";

// Tipo do pool avulso sem depender de "pg" diretamente (dep do lib/db).
type StandalonePool = ReturnType<typeof createStandaloneDb>["pool"];
import { describeDbError, writeDbConfigFile, type StoredDbConfig } from "../lib/dbConfig.js";
import { getSetupMode, verifySetupToken } from "../lib/setupState.js";
import { encryptionAvailable } from "../lib/crypto.js";
import { ensureSchema } from "../lib/ensureSchema.js";
import { hashPassword } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── Entrada de conexão (string completa OU campos separados) ─────────────────

interface ConnectionFields {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  password?: string;
  /** "disable" | "require" | "no-verify" (Supabase/pooler) */
  ssl?: string;
}

export function connectionFromBody(body: Record<string, unknown>): string | null {
  const direct = typeof body["connectionString"] === "string" ? body["connectionString"].trim() : "";
  if (direct) return direct;
  const f = (body["fields"] ?? null) as ConnectionFields | null;
  if (!f?.host || !f.database || !f.user || !f.password) return null;
  const port = Number(f.port) > 0 ? Number(f.port) : 5432;
  const sslQuery =
    f.ssl === "no-verify" ? "?sslmode=no-verify" : f.ssl === "require" ? "?sslmode=require" : "";
  // encodeURIComponent: senhas do Supabase costumam ter @/# — codificar aqui
  // evita o erro clássico de connection string inválida.
  return (
    `postgresql://${encodeURIComponent(f.user)}:${encodeURIComponent(f.password)}` +
    `@${f.host.trim()}:${port}/${encodeURIComponent(f.database)}${sslQuery}`
  );
}

// ── Probe do banco candidato ──────────────────────────────────────────────────

export interface ProbeResult {
  version: string;
  canCreate: boolean;
  tableCount: number;
  hasExistingInstall: boolean;
}

export async function probeCandidate(pool: StandalonePool): Promise<ProbeResult> {
  const v = await pool.query(
    "SELECT current_setting('server_version_num')::int AS num, current_setting('server_version') AS label",
  );
  const num = Number(v.rows[0]?.num ?? 0);
  const label = String(v.rows[0]?.label ?? "?");
  if (num < 140000) {
    throw new Error(`PostgreSQL 14 ou superior é necessário — o servidor informou ${label}.`);
  }
  const priv = await pool.query(
    "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can_create",
  );
  const tables = await pool.query(
    "SELECT count(*)::int AS n FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
  );
  const installed = await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS has_users");
  return {
    version: label,
    canCreate: !!priv.rows[0]?.can_create,
    tableCount: Number(tables.rows[0]?.n ?? 0),
    hasExistingInstall: !!installed.rows[0]?.has_users,
  };
}

/** Executa a baseline (0000_init.sql) numa transação — tudo ou nada. */
export async function applyBaseline(dbc: Db): Promise<number> {
  const statements = baselineSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  await dbc.transaction(async (tx) => {
    for (const stmt of statements) {
      await tx.execute(sql.raw(stmt));
    }
  });
  return statements.length;
}

const REQUIRED_TABLES = ["users", "articles", "settings", "rss_sources"];

export async function verifyTables(pool: StandalonePool): Promise<string[]> {
  const missing: string[] = [];
  for (const t of REQUIRED_TABLES) {
    const r = await pool.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${t}`]);
    if (!r.rows[0]?.ok) missing.push(t);
  }
  return missing;
}

// ── Proteção: instância instalada + token do log ─────────────────────────────

let _tokenFailures = 0;
const TOKEN_FAILURE_LIMIT = 20;

function setupGuard(req: Request, res: Response, next: NextFunction): void {
  if (!getSetupMode().required) {
    res.status(403).json({ error: "already_installed" });
    return;
  }
  if (_tokenFailures >= TOKEN_FAILURE_LIMIT) {
    res.status(429).json({
      error: "Muitas tentativas de token inválidas — reinicie o container para gerar outro token.",
    });
    return;
  }
  if (!verifySetupToken(req.header("X-Setup-Token"))) {
    _tokenFailures++;
    res.status(401).json({
      error: "Setup token inválido — copie o token impresso no log do container no boot.",
    });
    return;
  }
  next();
}

// ── Rotas ─────────────────────────────────────────────────────────────────────

// Status público: o frontend decide se redireciona para /admin/setup.
router.get("/", (_req, res) => {
  const mode = getSetupMode();
  if (!mode.required) {
    res.json({ ok: true, setupRequired: false });
    return;
  }
  res.json({
    ok: true,
    setupRequired: true,
    reason: mode.reason,
    error: mode.error ?? null,
    encryptionAvailable: encryptionAvailable(),
  });
});

// Testa o banco candidato: conexão, versão, permissão de CREATE e conteúdo.
router.post("/test", setupGuard, async (req, res) => {
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

// Instala: baseline + ensureSchema + 1º admin + arquivo criptografado + restart.
router.post("/apply", setupGuard, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const connectionString = connectionFromBody(body);
  if (!connectionString) {
    res.status(400).json({ ok: false, error: "Informe a connection string ou os campos de conexão." });
    return;
  }
  if (!encryptionAvailable()) {
    res.status(400).json({
      ok: false,
      error:
        "SETTINGS_ENCRYPTION_KEY (ou SESSION_SECRET) não definida no ambiente — a instalação não grava credenciais em texto puro. Defina a variável e reinicie.",
    });
    return;
  }

  const admin = (body["admin"] ?? null) as { name?: string; email?: string; password?: string } | null;
  const adminEmail = (admin?.email ?? "").trim().toLowerCase();
  const adminName = (admin?.name ?? "").trim();
  const adminPassword = admin?.password ?? "";
  if (!adminName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminPassword.length < 8) {
    res.status(400).json({
      ok: false,
      error: "Dados do administrador inválidos — nome, e-mail válido e senha com 8+ caracteres.",
    });
    return;
  }

  const storage = (body["storage"] ?? null) as
    | { supabaseUrl?: string; serviceRoleKey?: string; bucket?: string }
    | null;

  const { pool, db: candidateDb } = createStandaloneDb(connectionString);
  try {
    // 1) conexão + validação
    const probe = await probeCandidate(pool);
    if (!probe.canCreate) {
      res.json({ ok: false, error: "O usuário do banco não tem permissão de CREATE no schema public." });
      return;
    }

    // 2) migrations: baseline só em banco sem instalação; incrementos idempotentes sempre
    let baselineStatements = 0;
    if (!probe.hasExistingInstall) {
      baselineStatements = await applyBaseline(candidateDb);
    }
    await ensureSchema(candidateDb);

    // 3) verificação
    const missing = await verifyTables(pool);
    if (missing.length > 0) {
      res.json({ ok: false, error: `Migração incompleta — tabelas ausentes: ${missing.join(", ")}.` });
      return;
    }

    // 4) primeiro admin (substitui o seed por env; banco reaproveitado mantém os usuários)
    const [{ count }] = await candidateDb
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);
    let adminCreated = false;
    if (count === 0) {
      await candidateDb.insert(usersTable).values({
        name: adminName,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        role: "admin",
        status: "active",
        mustChangePassword: 0,
      });
      adminCreated = true;
    }

    // 5) grava o arquivo criptografado — a partir do próximo boot o app conecta sozinho
    const config: StoredDbConfig = { v: 1, connectionString };
    if (storage?.supabaseUrl && storage.serviceRoleKey) {
      config.supabaseUrl = storage.supabaseUrl.trim().replace(/\/+$/, "");
      config.supabaseServiceRoleKey = storage.serviceRoleKey.trim();
      if (storage.bucket?.trim()) config.supabaseStorageBucket = storage.bucket.trim();
    }
    writeDbConfigFile(config);

    logger.warn(
      { adminEmail, adminCreated, baselineStatements, existingInstall: probe.hasExistingInstall },
      "Instalação concluída pelo assistente — reiniciando para conectar ao banco configurado.",
    );
    res.json({ ok: true, restarting: true, adminCreated, existingInstall: probe.hasExistingInstall });

    // 6) restart controlado: o compose (restart: unless-stopped) religa em segundos
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    logger.error({ err }, "Falha na instalação pelo assistente");
    res.status(500).json({ ok: false, error: describeDbError(err) });
  } finally {
    await pool.end().catch(() => {});
  }
});

export default router;
