/**
 * Card de progresso da reescrita interna com IA (barra "Artigos reescritos com
 * IA" + monitor da fila). Morava no topo de Artigos; como a coleta padrão é
 * central-push (pipeline interno dormente), ele só faz sentido em Fontes RSS e
 * SOMENTE quando a coleta local está ativada com pelo menos 1 fonte ativa —
 * quem renderiza (RSSManager) aplica essa condição.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import {
  Loader2, Zap, RefreshCw, CheckCircle2, Clock, Play, StopCircle, Wrench,
} from "lucide-react";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

interface HistoryEntry {
  articleId: string;
  title:     string;
  status:    "ok" | "failed";
  at:        number;
  error?:    string;
}

interface QueueStatus {
  pending: number; paused: boolean; processedTotal: number; failedTotal: number;
  queuedIds: string[];
  currentItem: { articleId: string; title: string; startedAt: number } | null;
  recentHistory: HistoryEntry[];
  quota: { usedToday: number; dailyLimit: number; remaining: number; isOnCooldown: boolean; isExhausted: boolean; cooldownSecs: number };
}

interface Props {
  /** Artigos já reescritos / total (na página de fontes: só os importados). */
  totalRewritten: number;
  totalArticles:  number;
  /** Chamado quando uma ação do card altera artigos (reparo/refresh manual). */
  onArticlesChanged?: () => void;
}

export default function RewriteQueueCard({ totalRewritten, totalArticles, onArticlesChanged }: Props) {
  const [queueStatus, setQueueStatus]     = useState<QueueStatus | null>(null);
  const [bulkLoading, setBulkLoading]     = useState(false);
  const [bulkDone, setBulkDone]           = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult]   = useState<{ fixed: number; total: number } | null>(null);

  const sessionBaselineRef = useRef<{ processedTotal: number; initialPending: number } | null>(null);
  const [sessionProgress, setSessionProgress] = useState<{ done: number; total: number; finished: boolean } | null>(null);

  const rewrittenPct = totalArticles > 0 ? Math.round((totalRewritten / totalArticles) * 100) : 0;

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/queue/status`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) return;
      const data = await res.json() as QueueStatus;
      setQueueStatus(data);

      const isActive = data.pending > 0 || data.quota.isOnCooldown;
      if (isActive) {
        if (!sessionBaselineRef.current) {
          sessionBaselineRef.current = { processedTotal: data.processedTotal, initialPending: data.pending };
        }
        const done  = data.processedTotal - sessionBaselineRef.current.processedTotal;
        const total = sessionBaselineRef.current.initialPending;
        setSessionProgress({ done, total, finished: false });
      } else if (sessionBaselineRef.current) {
        const done  = data.processedTotal - sessionBaselineRef.current.processedTotal;
        const total = sessionBaselineRef.current.initialPending;
        setSessionProgress({ done, total, finished: true });
        setTimeout(() => { sessionBaselineRef.current = null; setSessionProgress(null); }, 20_000);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadQueue();
    const iv = setInterval(() => { void loadQueue(); }, 4_000);
    return () => clearInterval(iv);
  }, [loadQueue]);

  async function handleBulkRewrite() {
    setBulkLoading(true);
    setBulkDone(false);
    try {
      const res = await fetch(`${BASE}api/admin/queue/process-drafts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json() as { added: number; pending: number };
      await loadQueue();
      setBulkDone(true);
      setTimeout(() => setBulkDone(false), 3000);
      if (d.added === 0) alert("Todos os rascunhos já estão na fila ou foram reescritos.");
    } catch { } finally { setBulkLoading(false); }
  }

  async function handleRepairContent() {
    if (!confirm("Isso vai corrigir artigos com conteúdo em formato JSON bruto. Continuar?")) return;
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const r = await adminApi.repairContent();
      setRepairResult({ fixed: r.fixed, total: r.total });
      if (r.fixed > 0) onArticlesChanged?.();
      setTimeout(() => setRepairResult(null), 8000);
    } catch { alert("Erro ao reparar conteúdo."); } finally { setRepairLoading(false); }
  }

  async function handleTogglePause() {
    if (!queueStatus) return;
    const path = queueStatus.paused ? "resume" : "pause";
    await fetch(`${BASE}api/admin/queue/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    await loadQueue();
  }

  return (
    <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
      {/* Row 1: progress bar + cota + controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Progress */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-600">Artigos reescritos com IA</span>
            <span className="text-xs font-bold text-purple-700">{totalRewritten} / {totalArticles} ({rewrittenPct}%)</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-700"
              style={{ width: `${rewrittenPct}%` }}
            />
          </div>
        </div>

        {/* Cota */}
        {queueStatus && (
          <div className="text-center shrink-0">
            <p className={`text-sm font-bold ${queueStatus.quota.isExhausted ? "text-red-600" : queueStatus.quota.remaining <= 20 ? "text-amber-600" : "text-green-600"}`}>
              {queueStatus.quota.usedToday}/{queueStatus.quota.dailyLimit}
            </p>
            <p className="text-[10px] text-slate-400">cota/dia</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2 shrink-0">
          {queueStatus && (
            <button
              onClick={() => void handleTogglePause()}
              className={`p-2 rounded-xl text-xs font-semibold transition-colors ${queueStatus.paused ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              title={queueStatus.paused ? "Retomar fila" : "Pausar fila"}
            >
              {queueStatus.paused ? <Play size={14} /> : <StopCircle size={14} />}
            </button>
          )}
          <button
            onClick={() => { onArticlesChanged?.(); void loadQueue(); }}
            className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => void handleBulkRewrite()}
            disabled={bulkLoading || queueStatus?.quota.isExhausted}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: bulkDone ? "#16A34A" : "#7C3AED" }}
          >
            {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : bulkDone ? <CheckCircle2 size={14} /> : <Zap size={14} />}
            {bulkDone ? "Enfileirado!" : "Reescrever tudo com IA"}
          </button>
          <button
            onClick={() => void handleRepairContent()}
            disabled={repairLoading}
            title="Corrige artigos cujo conteúdo foi salvo como JSON bruto em vez de HTML"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-40"
          >
            {repairLoading ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
            {repairLoading ? "Reparando…" : "Reparar conteúdo"}
          </button>
          {repairResult && (
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${repairResult.fixed > 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-100 text-slate-500"}`}>
              {repairResult.fixed > 0 ? `✓ ${repairResult.fixed} corrigido(s)` : "Nenhum artigo quebrado"}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: queue monitor — only when queue has activity */}
      {queueStatus && (sessionProgress || queueStatus.pending > 0 || queueStatus.currentItem || queueStatus.quota.isOnCooldown || queueStatus.recentHistory.length > 0) && (
        <div className="border-t border-slate-100 pt-3 space-y-2">

          {/* Session progress bar */}
          {sessionProgress && sessionProgress.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-purple-700 flex items-center gap-1.5">
                  {sessionProgress.finished
                    ? <CheckCircle2 size={11} className="text-green-500" />
                    : <Loader2 size={11} className="animate-spin" />
                  }
                  {sessionProgress.finished ? "Sessão concluída" : "Reescrevendo com IA"}
                </span>
                <span className="text-[11px] font-bold text-purple-700">
                  {sessionProgress.done} / {sessionProgress.total} artigos
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${sessionProgress.finished ? "bg-green-500" : "bg-gradient-to-r from-purple-500 to-purple-400"}`}
                  style={{ width: `${Math.min(100, sessionProgress.total > 0 ? Math.round((sessionProgress.done / sessionProgress.total) * 100) : 0)}%` }}
                />
              </div>
              {!sessionProgress.finished && queueStatus.pending > 0 && (
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{queueStatus.pending} restantes na fila</span>
                  <span>~{Math.max(1, Math.ceil(queueStatus.pending * 7 / 9 / 60))} min</span>
                </div>
              )}
            </div>
          )}

          {/* Currently processing */}
          {queueStatus.currentItem && (
            <div className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2">
              <Loader2 size={13} className="animate-spin text-purple-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-purple-700 font-semibold truncate">
                  Processando: {queueStatus.currentItem.title}
                </p>
              </div>
              <span className="text-[10px] text-purple-400 shrink-0">
                {Math.round((Date.now() - queueStatus.currentItem.startedAt) / 1000)}s
              </span>
            </div>
          )}

          {/* Cooldown warning */}
          {queueStatus.quota.isOnCooldown && !queueStatus.currentItem && (
            <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
              <Clock size={13} className="text-red-400 shrink-0" />
              <p className="text-[11px] text-red-600 font-semibold">
                Cooldown Gemini — aguardando {queueStatus.quota.cooldownSecs}s para retomar
              </p>
            </div>
          )}

          {/* Recent history */}
          {queueStatus.recentHistory.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Últimos processados</p>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {queueStatus.recentHistory.slice(0, 8).map((h, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50">
                    {h.status === "ok"
                      ? <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                      : <span className="w-[11px] h-[11px] rounded-full bg-red-400 shrink-0 text-[8px] flex items-center justify-center text-white font-bold">!</span>
                    }
                    <p className={`text-[11px] truncate flex-1 ${h.status === "ok" ? "text-slate-600" : "text-red-600"}`}>
                      {h.title}
                    </p>
                    <span className="text-[10px] text-slate-300 shrink-0">
                      {new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
