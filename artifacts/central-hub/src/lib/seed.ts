import { randomBytes, randomUUID } from "node:crypto";
import { db, centralUsersTable } from "@workspace/central-db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../middlewares/auth.js";
import { logger } from "./logger.js";

const isProd = process.env["NODE_ENV"] === "production";

/** Cria o primeiro admin do painel central se a tabela estiver vazia. */
export async function seedCentralAdmin(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(centralUsersTable);
    if ((row?.count ?? 0) > 0) return;

    const email = (process.env["CENTRAL_ADMIN_EMAIL"] ?? "admin@central.local").toLowerCase();
    let password = process.env["CENTRAL_ADMIN_PASSWORD"];
    let generated = false;

    if (!password) {
      if (isProd) {
        // Nunca semear senha conhecida em produção: gera aleatória e loga UMA vez.
        password = randomBytes(12).toString("base64url");
        generated = true;
      } else {
        password = "central@dev"; // somente dev
      }
    }

    await db.insert(centralUsersTable).values({
      id: randomUUID(),
      name: "Administrador Central",
      email,
      passwordHash: hashPassword(password),
      role: "admin",
      isActive: true,
    });

    if (generated) {
      logger.warn(
        { email },
        `Admin central criado com senha ALEATÓRIA (CENTRAL_ADMIN_PASSWORD não definida). ` +
          `Senha inicial: ${password} — troque no primeiro login.`,
      );
    } else {
      logger.info({ email }, "Admin central seed criado");
    }
  } catch (err) {
    logger.error({ err }, "Falha ao semear admin central");
  }
}
