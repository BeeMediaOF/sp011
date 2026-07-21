/**
 * Autorização por papel (RBAC — PRD-02). Módulo PURO: importa só tipos do
 * express, nenhum runtime de banco — testável sem DB (o `auth.ts` importa
 * central-db e lança sem CENTRAL_DATABASE_URL, então o guard vive aqui).
 *
 * Matriz de papéis (central_users.role):
 *   admin    → acesso total (default do schema + seed; todos os usuários atuais)
 *   operator → operacional (entregas, publicação manual, leituras); NÃO toca
 *              segredos / estrutura de blogs / chaves de IA.
 * Papel legado/desconhecido (fora de {admin, operator}) é tratado como SEM o
 * privilégio pedido. Montar SEMPRE depois de authMiddleware, que popula
 * req.centralUserRole a partir do BANCO (fresco) — nunca do role do token.
 */
import type { Request, Response, NextFunction } from "express";

export function requireCentralRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.centralUserRole;
    if (role && roles.includes(role)) {
      next();
      return;
    }
    res.status(403).json({ error: `Acesso negado. Requer papel: ${roles.join(", ")}.` });
  };
}
