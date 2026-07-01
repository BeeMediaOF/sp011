import { randomBytes } from "crypto";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../middlewares/auth.js";
import { logger } from "./logger.js";

const isProd = process.env["NODE_ENV"] === "production";

export async function seedAdminUser(): Promise<void> {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
    if (count > 0) return;

    const email = (process.env["ADMIN_DEFAULT_EMAIL"] ?? "admin@sbcagora.com.br").toLowerCase();
    let password = process.env["ADMIN_DEFAULT_PASSWORD"];
    let generated = false;

    if (!password) {
      if (isProd) {
        // Nunca semear uma senha conhecida/publicada em produção. Gera uma
        // aleatória e registra UMA vez no log para o operador copiar.
        password = randomBytes(12).toString("base64url");
        generated = true;
      } else {
        password = "brasilia@2024"; // dev only — nunca chega a produção
      }
    }

    await db.insert(usersTable).values({
      name: "Administrador",
      email,
      passwordHash: hashPassword(password),
      role: "admin",
      status: "active",
      // Sempre forçar troca no primeiro login quando a senha não veio de env explícita.
      mustChangePassword: process.env["ADMIN_DEFAULT_PASSWORD"] ? 0 : 1,
    });

    if (generated) {
      logger.warn(
        { email },
        `Admin seed criado com senha ALEATÓRIA (ADMIN_DEFAULT_PASSWORD não definida). ` +
        `Senha inicial: ${password} — troque no primeiro login.`,
      );
    } else {
      logger.info({ email }, "Admin seed user created");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
