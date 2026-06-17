import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import {
  Plus, Pencil, Trash2, Send, Search, Rss, Wand2,
  FileText, FileArchive, Calendar, Archive,
  Eye, MoreHorizontal, ChevronLeft, ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const PAGE_SIZE = 12;

const CAT_COLORS: Record<string, string> = {
  cidades:      "#2563EB",
  política:     "#E71D36",
  politica:     "#E71D36",
  economia:     "#F97316",
  esportes:     "#16A34A",
  cultura:      "#7C3AED",
  tecnologia:   "#0891b2",
  saude:        "#EF4444",
  "saúde":      "#EF4444",
  educação:     "#F59E0B",
  educacao:     "#F59E0B",
  "trânsito":   "#16A34A",
  transito:     "#16A34A",
  "meio ambiente": "#22C55E",
  geral:        "#64748B",
};

function catColor(cat?: string) {
  return CAT_COLORS[cat?.toLowerCase() ?? ""] ?? "#64748B";
}

function fmtDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    + " · " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type ArticleStatus = "draft" | "published" | "scheduled" | "archived";
type StatusFilter  = "all" | ArticleStatus;

const STATUS_LABELS: Record<StatusFilter, string> = {
  all:       "Todos",
  published: "Publicado",
  draft:     "Rascunho",
  scheduled: "Agendado",
  archived:  "Arquivado",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    published: { label: "Publicado", bg: "#DCFCE7", text: "#16A34A" },
    draft:     { label: "Rascunho",  bg: "#FEF3C7", text: "#D97706" },
    scheduled: { label: "Agendado",  bg: "#DBEAFE", text: "#2563EB" },
    archived:  { label: "Arquivado", bg: "#F1F5F9", text: "#64748B" },
  };
  const s = map[status] ?? map.draft;
  return (
    <span
      className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

export default function Articles() {
  const [articles, setArticles]     = useState<Article[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState<StatusFilter>("all");
  const [catFilter, setCat]         = useState("todas");
  const [page, setPage]             = useState(1);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    adminApi.getArticles()
      .then((r) => setArticles(r.articles))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

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
      setArticles((prev) => prev.map((a) => a.id === id ? article : a));
    } catch { } finally { setPublishing(null); }
  }

  const published = articles.filter((a) => (a.status as string) === "published");
  const drafts    = articles.filter((a) => (a.status as string) === "draft");
  const scheduled = articles.filter((a) => (a.status as string) === "scheduled");
  const archived  = articles.filter((a) => (a.status as string) === "archived");

  const cats = Array.from(new Set(articles.map((a) => a.category?.toLowerCase()).filter(Boolean)));

  const filtered = articles.filter((a) => {
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && (a.status as string) === "published") ||
      (statusFilter === "draft"     && (a.status as string) === "draft") ||
      (statusFilter === "scheduled" && (a.status as string) === "scheduled") ||
      (statusFilter === "archived"  && (a.status as string) === "archived");
    const matchCat = catFilter === "todas" || a.category?.toLowerCase() === catFilter;
    const matchSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (a.rssSourceName ?? "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCat && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changePage(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }

  const kpis = [
    { label: "Publicados", value: published.length, pct: "+12,4%", icon: FileText,    bg: "#ECFDF5", clr: "#16A34A" },
    { label: "Rascunhos",  value: drafts.length,    pct: "+8,7%",  icon: FileArchive, bg: "#FFF7ED", clr: "#F97316" },
    { label: "Agendados",  value: scheduled.length, pct: "+6,1%",  icon: Calendar,    bg: "#F5F3FF", clr: "#7C3AED" },
    { label: "Arquivados", value: archived.length,  pct: "+3,2%",  icon: Archive,     bg: "#F1F5F9", clr: "#64748B" },
  ];

  return (
    <AdminLayout title="Artigos">
      <div className="space-y-6">

        {/* ── KPI cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map(({ label, value, pct, icon: Icon, bg, clr }) => (
            <div key={label} className="bg-white rounded-2xl p-5 flex items-center gap-4" style={{ boxShadow: CARD_SHADOW }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                <Icon size={20} style={{ color: clr }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-[#0F172A] leading-none">
                  {loading ? <span className="inline-block w-10 h-6 bg-slate-100 rounded animate-pulse" /> : value.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{label}</p>
                <p className="text-[11px] text-green-600 font-semibold mt-0.5 flex items-center gap-0.5">
                  <ArrowUpRight size={10} />{pct} vs últimos 7 dias
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Table panel ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>

          {/* Filters bar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar artigos..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] transition-colors placeholder:text-slate-400"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(1); }}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] text-slate-600 cursor-pointer"
            >
              <option value="all">Status: Todos</option>
              {(["published","draft","scheduled","archived"] as StatusFilter[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>

            {/* Category filter */}
            <select
              value={catFilter}
              onChange={(e) => { setCat(e.target.value); setPage(1); }}
              className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] text-slate-600 cursor-pointer"
            >
              <option value="todas">Categoria: Todas</option>
              {cats.map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>

            {/* Spacer + New article */}
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
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden xl:table-cell">Autor</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">
                      <button className="flex items-center gap-1 hover:text-slate-600">
                        Data
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Views</th>
                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((a) => {
                    const color = catColor(a.category);
                    return (
                      <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors group">

                        {/* Title + thumbnail */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            {a.imageUrl ? (
                              <img
                                src={a.imageUrl}
                                alt=""
                                className="w-11 h-11 rounded-xl object-cover shrink-0 bg-slate-100"
                              />
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

                        {/* Author */}
                        <td className="px-4 py-3.5 hidden xl:table-cell">
                          <span className="text-xs text-slate-500">Administrador</span>
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
                          <span className="text-sm font-semibold text-[#0F172A]">
                            {a.status === "published" ? ((a as unknown as Record<string,unknown>).views as number ?? 0).toLocaleString("pt-BR") : "—"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {a.status === "draft" && (
                              <button
                                onClick={() => { void handlePublish(a.id); }}
                                disabled={publishing === a.id}
                                title="Publicar"
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
                              onClick={() => { void handleDelete(a.id); }}
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
                Mostrando {((page - 1) * PAGE_SIZE) + 1} a {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} artigos
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changePage(page - 1)}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-100 transition-colors disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => changePage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                        p === page
                          ? "bg-[#0B2A66] text-white"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                {totalPages > 5 && page < totalPages - 2 && (
                  <>
                    <span className="text-slate-300 px-1">…</span>
                    <button
                      onClick={() => changePage(totalPages)}
                      className="w-8 h-8 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  onClick={() => changePage(page + 1)}
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
