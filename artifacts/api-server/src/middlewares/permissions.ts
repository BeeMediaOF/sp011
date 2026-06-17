import { eq, and } from "drizzle-orm";
import { db, rolePermissionsTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

export function requirePermission(key: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.userRole === "admin") { next(); return; }
    try {
      const [perm] = await db
        .select()
        .from(rolePermissionsTable)
        .where(
          and(
            eq(rolePermissionsTable.role, "editor"),
            eq(rolePermissionsTable.permissionKey, key),
          ),
        );
      if (perm?.enabled) { next(); return; }
    } catch {
      // On DB error, deny access
    }
    res
      .status(403)
      .json({ error: "Acesso restrito. O administrador não liberou esta função para o seu perfil." });
  };
}
