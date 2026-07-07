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

const STATUS_CLASS: Record<string, string> = {
  delivered: "ok", duplicate: "ok", online: "ok", rewritten: "ok", distributed: "ok", ok: "ok",
  pending: "info", delivering: "info", queued: "info", rewriting: "info", collected: "info",
  localizing: "info",
  awaiting_approval: "warn", awaiting_localization: "warn", offline: "warn",
  failed: "err", dead: "err", error: "err", discarded: "err", cancelled: "err",
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
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
