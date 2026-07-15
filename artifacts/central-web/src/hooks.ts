import { useCallback, useEffect, useState } from "react";

/** Carrega dados de uma promise com estado de loading/erro e reload manual. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fn().then(
      (d) => { if (alive) { setData(d); setLoading(false); } },
      (e: unknown) => { if (alive) { setError(String((e as Error).message ?? e)); setLoading(false); } },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** "há 3 min" / "há 2 h" / "há 5 d" — tempo relativo curto. */
export function timeAgo(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return "—";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return "agora mesmo";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86_400)} d`;
}

/** Cor determinística por nome (categoria/blog) — nunca muda com filtro. */
const NAME_PALETTE = ["#2563eb", "#e71d36", "#f97316", "#16a34a", "#7c3aed", "#0891b2", "#d97706", "#db2777"];

export function nameColor(name: string | null | undefined): string {
  if (!name) return "#64748b";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return NAME_PALETTE[h % NAME_PALETTE.length] ?? "#64748b";
}

const STATUS_CLASS: Record<string, string> = {
  delivered: "ok", duplicate: "ok", online: "ok", rewritten: "ok", distributed: "ok", ok: "ok",
  pending: "info", delivering: "info", queued: "info", rewriting: "info", collected: "info",
  localizing: "info",
  awaiting_approval: "warn", awaiting_localization: "warn", offline: "warn",
  failed: "err", dead: "err", error: "err", discarded: "err", cancelled: "err",
  // Automação Social (vídeos)
  downloading: "info", ready: "info", scheduled: "warn", publishing: "info", sent: "ok",
};

export function statusClass(status: string): string {
  return STATUS_CLASS[status] ?? "";
}

export const STATUS_LABEL: Record<string, string> = {
  collected: "coletada", queued: "na fila", rewriting: "reescrevendo",
  rewritten: "reescrita", distributed: "distribuída", failed: "falhou", discarded: "descartada",
  awaiting_localization: "aguardando tradução/categoria", localizing: "traduzindo",
  awaiting_approval: "aguardando aprovação", pending: "pendente", delivering: "enviando",
  delivered: "entregue", duplicate: "duplicada no blog", dead: "esgotou tentativas", cancelled: "cancelada",
  online: "online", offline: "offline", error: "erro",
  // Automação Social (vídeos)
  downloading: "baixando", ready: "pronto", scheduled: "agendado", publishing: "publicando", sent: "postado",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
