import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../middlewares/auth.js";
import { logger } from "./logger.js";

export async function seedAdminUser(): Promise<void> {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
    if (count > 0) return;

    const email = (process.env["ADMIN_DEFAULT_EMAIL"] ?? "admin@sbcagora.com.br").toLowerCase();
    const password = process.env["ADMIN_DEFAULT_PASSWORD"] ?? "brasilia@2024";

    await db.insert(usersTable).values({
      name: "Administrador",
      email,
      passwordHash: hashPassword(password),
      role: "admin",
      status: "active",
      mustChangePassword: 0,
    });

    logger.info({ email }, "Admin seed user created");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}
