import { eq, and } from "drizzle-orm";
import { db, rolePermissionsTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

export function requirePermission(key: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.userRole === "admin" || req.isWebhookKey) { next(); return; }
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

/**
 * Variante que só exige a permissão em métodos que alteram estado
 * (POST/PUT/PATCH/DELETE). GET/HEAD passam direto — útil para routers em que
 * a leitura é liberada a qualquer usuário autenticado, mas a escrita depende
 * de uma permissão do perfil Editor.
 */
export function requirePermissionForWrites(key: string) {
  const check = requirePermission(key);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET" || req.method === "HEAD") { next(); return; }
    void check(req, res, next);
  };
}
