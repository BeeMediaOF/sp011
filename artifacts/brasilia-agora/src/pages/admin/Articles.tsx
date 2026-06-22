import React, { useEffect, useState, useCallback } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import {
  Plus, Pencil, Trash2, Send, Search, Rss, Wand2,
  FileText, FileArchive, Calendar, Archive,
  Eye, ChevronLeft, ChevronRight, ArrowUpRight,
  Loader2, Zap, RefreshCw, CheckCircle2, Clock, Play, StopCircle, Wrench,
} from "lucide-react";
import { Link } from "wouter";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const PAGE_SIZE = 12;
const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

const CAT_COLORS: Record<string, string> = {
  cidades: "#2563EB", política: "#E71D36", politica: "#E71D36",
  economia: "#F97316", esportes: "#16A34A", cultura: "#7C3AED",
  tecnologia: "#0891b2", saude: "#EF4444", "saúde": "#EF4444",
  educação: "#F59E0B", educacao: "#F59E0B", "trânsito": "#16A34A",
  transito: "#16A34A", "meio ambiente": "#22C55E", geral: "#64748B",
};
function catColor(cat?: string) { return CAT_COLORS[cat?.toLowerCase() ?? ""] ?? "#64748B"; }
function fmtDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    + " · " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type ArticleWithViews = Article & { views?: number };
type StatusFilter = "all" | "draft" | "published" | "scheduled" | "archived";

interface QueueStatus {
  pending: number; paused: boolean; processedTotal: number; failedTotal: number;
  queuedIds: string[];
  quota: { usedToday: number; dailyLimit: number; remaining: number; isOnCooldown: boolean; isExhausted: boolean; cooldownSecs: number };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    published: { label: "Publicado", bg: "#DCFCE7", text: "#16A34A" },
    draft:     { label: "Rascunho",  bg: "#FEF3C7", text: "#D97706" },
    scheduled: { label: "Agendado",  bg: "#DBEAFE", text: "#2563EB" },
    archived:  { label: "Arquivado", bg: "#F1F5F9", text: "#64748B" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function QueueBadge({ inQueue }: { inQueue: boolean }) {
  if (!inQueue) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full animate-pulse">
      <Clock size={8} />Na fila
    </span>
  );
}

export default function Articles() {
  const [articles, setArticles]     = useState<ArticleWithViews[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState<StatusFilter>("all");
  const [catFilter, setCat]         = useState("todas");
  const [page, setPage]             = useState(1);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [rewriting, setRewriting]   = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [bulkLoading, setBulkLoading]   = useState(false);
  const [bulkDone, setBulkDone]         = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult]   = useState<{ fixed: number; total: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getArticles()
      .then((r) => setArticles(r.articles as ArticleWithViews[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/queue/status`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) setQueueStatus(await res.json() as QueueStatus);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    void loadQueue();
    const iv = setInterval(() => { void loadQueue(); }, 6_000);
    return () => clearInterval(iv);
  }, [load, loadQueue]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este artigo permanentemente?")) return;
    setDeleting(id);
    try {
      await adminApi.deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch { } finally { setDeleting(null); }
  }

  async function handlePublish(id: string) {
    setPublishing(id);
    try {
      const { article } = await adminApi.publishArticle(id);
      setArticles((prev) => prev.map((a) => a.id === id ? { ...article, views: a.views } as ArticleWithViews : a));
    } catch { } finally { setPublishing(null); }
  }

  async function handleRewriteOne(id: string, title: string, content: string) {
    setRewriting(id);
    try {
      await fetch(`${BASE}api/admin/queue/process-drafts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ articleIds: [id] }),
      });
      await loadQueue();
    } catch { } finally { setRewriting(null); }
  }

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
      if (r.fixed > 0) load();
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

  const published = articles.filter((a) => a.status === "published");
  const drafts    = articles.filter((a) => a.status === "draft");
  const cats      = Array.from(new Set(articles.map((a) => a.category?.toLowerCase()).filter(Boolean)));
  const totalRewritten   = articles.filter((a) => a.aiRewritten).length;
  const rewrittenPct = articles.length > 0 ? Math.round((totalRewritten / articles.length) * 100) : 0;

  const filtered = articles.filter((a) => {
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && a.status === "published") ||
      (statusFilter === "draft"     && a.status === "draft");
    const matchCat    = catFilter === "todas" || a.category?.toLowerCase() === catFilter;
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.rssSourceName ?? "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCat && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const queuedSet  = new Set(queueStatus?.queuedIds ?? []);

  const kpis = [
    { label: "Publicados",  value: published.length, icon: FileText,    bg: "#ECFDF5", clr: "#16A34A" },
    { label: "Rascunhos",   value: drafts.length,    icon: FileArchive, bg: "#FFF7ED", clr: "#F97316" },
    { label: "Reescritos",  value: totalRewritten,   icon: Wand2,       bg: "#F5F3FF", clr: "#7C3AED" },
    { label: "Total Views",
      value: published.reduce((s, a) => s + (a.views ?? 0), 0),
      icon: Eye, bg: "#EFF6FF", clr: "#2563EB",
    },
  ];

  return (
    <AdminLayout title="Artigos">
      <div className="space-y-5">

        {/* ── KPI cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ label, value, icon: Icon, bg, clr }) => (
            <div key={label} className="bg-white rounded-2xl p-5 flex items-center gap-4" style={{ boxShadow: CARD_SHADOW }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon size={20} style={{ color: clr }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-[#0F172A] leading-none">
                  {loading
                    ? <span className="inline-block w-10 h-6 bg-slate-100 rounded animate-pulse" />
                    : value.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── IA Progress bar + bulk action ─────────────────── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
          <div className="flex flex-wrap items-center gap-4">
            {/* Progress */}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600">Artigos reescritos com IA</span>
                <span className="text-xs font-bold text-purple-700">{totalRewritten} / {articles.length} ({rewrittenPct}%)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-700"
                  style={{ width: `${rewrittenPct}%` }}
                />
              </div>
              {queueStatus && queueStatus.pending > 0 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ⏳ {queueStatus.pending} artigo(s) na fila — processando 1 a cada 6s
                </p>
              )}
              {queueStatus?.quota.isOnCooldown && (
                <p className="text-[11px] text-red-500 mt-1">
                  ⏸ Aguardando cooldown Gemini: {queueStatus.quota.cooldownSecs}s
                </p>
              )}
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
            <div className="flex gap-2 shrink-0">
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
                onClick={() => { load(); void loadQueue(); }}
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
                {bulkLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : bulkDone
                  ? <CheckCircle2 size={14} />
                  : <Zap size={14} />}
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
                  {repairResult.fixed > 0
                    ? `✓ ${repairResult.fixed} artigo(s) corrigido(s)`
                    : "Nenhum artigo com conteúdo quebrado"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Table panel ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>

          {/* Filters bar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar artigos..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors placeholder:text-slate-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] text-slate-600 cursor-pointer"
            >
              <option value="all">Status: Todos</option>
              <option value="published">Publicado</option>
              <option value="draft">Rascunho</option>
            </select>
            <select
              value={catFilter}
              onChange={(e) => { setCat(e.target.value); setPage(1); }}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] text-slate-600 cursor-pointer"
            >
              <option value="todas">Categoria: Todas</option>
              {cats.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
            <div className="flex-1" />
            <Link
              href="/admin/artigos/novo"
              className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shrink-0"
              style={{ background: "#E71D36" }}
            >
              <Plus size={15} /> Novo artigo
            </Link>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 rounded-full border-2 border-[#2563EB] border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Carregando artigos…</p>
            </div>
          ) : paginated.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <FileText size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? "Nenhum artigo encontrado" : "Nenhum artigo nesta categoria"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Título</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Categoria</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Data</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Views</th>
                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((a) => {
                    const color = catColor(a.category);
                    const inQueue = queuedSet.has(a.id);
                    const isRewriting = rewriting === a.id;
                    return (
                      <tr
                        key={a.id}
                        className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors group ${inQueue ? "bg-amber-50/30" : ""}`}
                      >
                        {/* Title + thumbnail */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            {a.imageUrl ? (
                              <img src={a.imageUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0 bg-slate-100" />
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                                <FileText size={15} className="text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[#0F172A] line-clamp-2 leading-snug group-hover:text-[#0B2A66] transition-colors">
                                {a.title.replace(/<[^>]*>/g, "")}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {a.origin === "rss" && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                    <Rss size={8} />{a.rssSourceName ?? "RSS"}
                                  </span>
                                )}
                                {a.aiRewritten && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                                    <Wand2 size={8} />IA
                                  </span>
                                )}
                                <QueueBadge inQueue={inQueue} />
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                            style={{ background: `${color}18`, color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                            {a.category || "Geral"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          <span className="text-xs text-slate-500">{fmtDate(a.updatedAt ?? a.createdAt)}</span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <StatusBadge status={a.status} />
                        </td>

                        {/* Views */}
                        <td className="px-4 py-3.5 hidden sm:table-cell">
                          {a.status === "published" ? (
                            <span className="flex items-center gap-1 text-sm font-semibold text-[#0F172A]">
                              <Eye size={12} className="text-slate-400" />
                              {(a.views ?? 0).toLocaleString("pt-BR")}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {/* Rewrite with AI button — only for non-rewritten drafts */}
                            {a.status === "draft" && !a.aiRewritten && !inQueue && (
                              <button
                                onClick={() => void handleRewriteOne(a.id, a.title, a.content)}
                                disabled={isRewriting}
                                title="Reescrever com IA"
                                className="p-2 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-40"
                              >
                                {isRewriting
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Wand2 size={14} />}
                              </button>
                            )}
                            {a.status === "draft" && !inQueue && (
                              <button
                                onClick={() => void handlePublish(a.id)}
                                disabled={publishing === a.id}
                                title="Publicar agora"
                                className="p-2 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                              >
                                <Send size={14} />
                              </button>
                            )}
                            {a.status === "published" && (
                              <a
                                href={`/artigo/${a.slug || a.id}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver artigo"
                                className="p-2 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                              >
                                <Eye size={14} />
                              </a>
                            )}
                            <Link
                              href={`/admin/artigos/${a.id}`}
                              title="Editar"
                              className="p-2 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 transition-colors"
                            >
                              <Pencil size={14} />
                            </Link>
                            <button
                              onClick={() => void handleDelete(a.id)}
                              disabled={deleting === a.id}
                              title="Excluir"
                              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Mostrando {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} artigos
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${p === page ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && page < totalPages - 2 && (
                  <>
                    <span className="text-slate-300 px-1">…</span>
                    <button onClick={() => setPage(totalPages)} className="w-8 h-8 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors">{totalPages}</button>
                  </>
                )}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 transition-colors disabled:opacity-30"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
