import type { Request, Response, NextFunction } from "express";
import { resolveUserPermissions } from "../routes/permissions.js";

export function requirePermission(key: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // PRD-03/AP-4: a webhook key NÃO fura mais requirePermission (o bypass da
    // key foi removido); ela só autoriza as rotas de publish via publishAuth.
    if (req.userRole === "admin") { next(); return; }
    try {
      // Permissão é POR USUÁRIO desde ago/2026 (user_permissions); quem ainda não
      // tem linhas próprias cai no modelo do perfil (role_permissions).
      const keys = await resolveUserPermissions(req.userId, req.userRole);
      if (keys.has(key)) { next(); return; }
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
