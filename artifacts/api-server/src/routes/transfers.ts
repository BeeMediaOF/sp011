/**
 * `/api/admin/transfers` — CRUD dos rumores de transferência e do catálogo de
 * clubes. Módulo por blog: nada aqui fala com a central e nada usa IA.
 *
 * Leitura exige `transfers.view`; qualquer escrita exige `transfers.manage`
 * (admin passa direto nas duas, por design). A validação toda mora em
 * `lib/transfers.ts`, que é puro e testado — esta rota só decide status HTTP,
 * grava e audita.
 *
 * ⚠️ `/clubs` vem ANTES de `/:id`: o Express casa na ordem de declaração, e sem
 * isso um DELETE em `/clubs/flamengo` seria lido como "apagar o rumor de id
 * 'clubs'".
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import { requirePermission, requirePermissionForWrites } from "../middlewares/permissions.js";
import { store } from "../lib/store.js";
import { logAudit, getClientIp } from "../lib/audit.js";
import {
  normalizeRumor, normalizeClub, applyClubPatch, rumorsUsingClub,
  MAX_RUMORS,
} from "../lib/transfers.js";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission("transfers.view"));
router.use(requirePermissionForWrites("transfers.manage"));

/** GET /api/admin/transfers — rumores em TODOS os status + catálogo de clubes.
 *  Uma requisição só: a busca de clube do formulário é filtrada no cliente
 *  (são ~100 itens), então o módulo não precisa de endpoint de autocomplete. */
router.get("/", (_req, res) => {
  res.json({
    rumors: store.getTransferRumors(),
    clubs: store.getTransferClubs(),
  });
});

// ─── Clubes ───────────────────────────────────────────────────────────────────

/** POST /api/admin/transfers/clubs — cadastro inline do formulário.
 *  Nome já cadastrado devolve 200 com o clube existente (`existing: true`) em
 *  vez de 409: para quem está preenchendo o formulário, "já existe" é sucesso. */
router.post("/clubs", async (req, res) => {
  const clubs = store.getTransferClubs();
  const r = normalizeClub(req.body, clubs);
  if (!r.ok || !r.club) { res.status(r.error?.startsWith("Limite") ? 409 : 400).json({ error: r.error }); return; }
  if (r.existing) { res.json({ club: r.club, existing: true }); return; }

  store.saveTransferClubs([...clubs, r.club]);
  await logAudit({
    userId: req.userId, userEmail: req.userEmail,
    action: "create_transfer_club", module: "transfers",
    description: `Clube cadastrado: ${r.club.name}`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    metadata: { id: r.club.id },
  });
  res.status(201).json({ club: r.club });
});

/** PUT /api/admin/transfers/clubs/:id — nome, país e escudo. O id não muda. */
router.put("/clubs/:id", (req, res) => {
  const id = String(req.params["id"] ?? "");
  const clubs = store.getTransferClubs();
  const idx = clubs.findIndex((c) => c.id === id);
  if (idx === -1) { res.status(404).json({ error: "Clube não encontrado." }); return; }

  const updated = applyClubPatch(clubs[idx]!, req.body);
  const next = [...clubs];
  next[idx] = updated;
  store.saveTransferClubs(next);
  res.json({ club: updated });
});

/** DELETE /api/admin/transfers/clubs/:id
 *  Clube em uso responde 409 com a contagem — o painel mostra "3 rumores usam
 *  este clube" antes de insistir com `?force=1`. Apagar assim mesmo NÃO apaga
 *  os rumores: eles ficam no cadastro e somem só do site (`publicRumors`
 *  descarta o órfão), para o operador consertar o destino sem perder o texto. */
router.delete("/clubs/:id", async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const clubs = store.getTransferClubs();
  if (!clubs.some((c) => c.id === id)) { res.status(404).json({ error: "Clube não encontrado." }); return; }

  const emUso = rumorsUsingClub(store.getTransferRumors(), id);
  if (emUso > 0 && req.query["force"] !== "1") {
    res.status(409).json({
      error: `${emUso} rumor(es) usam este clube.`,
      inUse: emUso,
    });
    return;
  }

  store.saveTransferClubs(clubs.filter((c) => c.id !== id));
  await logAudit({
    userId: req.userId, userEmail: req.userEmail,
    action: "delete_transfer_club", module: "transfers",
    description: `Clube excluído: ${id}${emUso > 0 ? ` (${emUso} rumor(es) ficaram sem destino)` : ""}`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    metadata: { id, inUse: emUso },
  });
  res.json({ success: true, orphaned: emUso });
});

// ─── Rumores ──────────────────────────────────────────────────────────────────

/** POST /api/admin/transfers */
router.post("/", async (req, res) => {
  const rumors = store.getTransferRumors();
  if (rumors.length >= MAX_RUMORS) {
    res.status(409).json({ error: `Limite de ${MAX_RUMORS} rumores atingido. Exclua os encerrados antes de cadastrar novos.` });
    return;
  }
  const r = normalizeRumor(req.body);
  if (!r.ok || !r.rumor) { res.status(400).json({ error: r.error }); return; }
  if (!clubesExistem(r.rumor.fromClubId, r.rumor.toClubId)) {
    res.status(400).json({ error: "Clube de origem ou destino não está cadastrado." });
    return;
  }

  store.saveTransferRumors([...rumors, r.rumor]);
  await logAudit({
    userId: req.userId, userEmail: req.userEmail,
    action: "create_transfer", module: "transfers",
    description: `Rumor cadastrado: ${r.rumor.playerName} (${r.rumor.fromClubId} → ${r.rumor.toClubId}, ${r.rumor.probability}%)`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    metadata: { id: r.rumor.id, status: r.rumor.status },
  });
  res.status(201).json({ rumor: r.rumor });
});

/** PUT /api/admin/transfers/:id */
router.put("/:id", async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const rumors = store.getTransferRumors();
  const idx = rumors.findIndex((r) => r.id === id);
  if (idx === -1) { res.status(404).json({ error: "Rumor não encontrado." }); return; }

  const r = normalizeRumor(req.body, rumors[idx]!);
  if (!r.ok || !r.rumor) { res.status(400).json({ error: r.error }); return; }
  if (!clubesExistem(r.rumor.fromClubId, r.rumor.toClubId)) {
    res.status(400).json({ error: "Clube de origem ou destino não está cadastrado." });
    return;
  }

  const next = [...rumors];
  next[idx] = r.rumor;
  store.saveTransferRumors(next);
  await logAudit({
    userId: req.userId, userEmail: req.userEmail,
    action: "update_transfer", module: "transfers",
    description: `Rumor editado: ${r.rumor.playerName} (${r.rumor.probability}%, ${r.rumor.status})`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    metadata: { id: r.rumor.id },
  });
  res.json({ rumor: r.rumor });
});

/** DELETE /api/admin/transfers/:id */
router.delete("/:id", async (req, res) => {
  const id = String(req.params["id"] ?? "");
  const rumors = store.getTransferRumors();
  const alvo = rumors.find((r) => r.id === id);
  if (!alvo) { res.status(404).json({ error: "Rumor não encontrado." }); return; }

  store.saveTransferRumors(rumors.filter((r) => r.id !== id));
  await logAudit({
    userId: req.userId, userEmail: req.userEmail,
    action: "delete_transfer", module: "transfers",
    description: `Rumor excluído: ${alvo.playerName}`,
    ipAddress: getClientIp(req), userAgent: req.headers["user-agent"],
    metadata: { id },
  });
  res.json({ success: true });
});

/** Os dois clubes precisam existir no catálogo NA HORA da escrita — senão o
 *  rumor nasceria órfão e o `publicRumors` o descartaria em silêncio, dando ao
 *  operador a impressão de que salvar não funcionou. */
function clubesExistem(fromId: string, toId: string): boolean {
  const ids = new Set(store.getTransferClubs().map((c) => c.id));
  return ids.has(fromId) && ids.has(toId);
}

export default router;
