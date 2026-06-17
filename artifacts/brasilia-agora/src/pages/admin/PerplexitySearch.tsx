import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Search, Wand2, Send, Loader2, ExternalLink, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Zap, Plus, Trash2,
  Clock, Play, ToggleLeft, ToggleRight, Pencil, X, Save,
} from "lucide-react";

const BASE  = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

const CATEGORIES = [
  "cidade","politica","seguranca","transporte","saude",
  "educacao","cultura","esportes","economia","tecnologia",
  "brasil","mundo","geral",
];
const HOURS_OPTIONS = [1,2,3,4,6,8,12,24,48];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerplexityArticle {
  title: string; summary: string; fullText: string;
  sourceUrl: string; sourceName: string; imageUrl: string; publishedAt: string;
}
interface RewriteResult {
  rewritten: string; keywords: string; slug: string; title: string; subtitle: string;
}
interface ArticleState {
  article: PerplexityArticle; expanded: boolean;
  rewriting: boolean; rewritten: RewriteResult | null;
  publishing: boolean; published: boolean; error: string | null;
  category: string; status: "draft" | "published";
}
interface Topic {
  id: string; name: string; query: string; category: string;
  active: boolean; scheduleHours: number; maxResults: number;
  autoMode: "none"|"draft"|"published"; lastRunAt?: string; createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}api/admin/perplexity/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data;
}
async function apiReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}api/admin/perplexity/${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  return data;
}

function timeSince(iso?: string): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h/24)}d atrás`;
  if (h > 0)  return `${h}h ${m}m atrás`;
  return `${m}m atrás`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PerplexitySearch() {
  const [tab, setTab] = useState<"search"|"topics">("search");

  // ── Manual search state ──
  const [query, setQuery]             = useState("");
  const [maxResults, setMaxResults]   = useState(5);
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [articles, setArticles]       = useState<ArticleState[]>([]);

  // ── Topics state ──
  const [topics, setTopics]           = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [editTopic, setEditTopic]     = useState<Topic | null>(null);
  const [runningId, setRunningId]     = useState<string | null>(null);
  const [runResult, setRunResult]     = useState<Record<string, string>>({});

  // ── Form fields ──
  const emptyForm = { name:"", query:"", category:"cidade", scheduleHours:6, maxResults:5, autoMode:"draft" as const, active:true };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string|null>(null);

  // Load topics
  useEffect(() => {
    if (tab !== "topics") return;
    setTopicsLoading(true);
    apiReq<{ topics: Topic[] }>("GET", "topics")
      .then((r) => setTopics(r.topics))
      .catch(() => {})
      .finally(() => setTopicsLoading(false));
  }, [tab]);

  // ── Manual search ──
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true); setSearchError(null); setArticles([]);
    try {
      const res = await apiPost<{ articles: PerplexityArticle[] }>("search", { query: query.trim(), maxResults });
      setArticles((res.articles ?? []).map((a) => ({
        article: a, expanded: false, rewriting: false, rewritten: null,
        publishing: false, published: false, error: null,
        category: "cidade", status: "draft",
      })));
    } catch (err) { setSearchError(String(err)); }
    finally { setSearching(false); }
  }

  function patchArticle(idx: number, patch: Partial<ArticleState>) {
    setArticles((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function handleRewrite(idx: number) {
    const s = articles[idx]!;
    patchArticle(idx, { rewriting: true, error: null });
    try {
      const res = await apiPost<RewriteResult>("rewrite", {
        title: s.article.title, text: s.article.fullText || s.article.summary,
        sourceName: s.article.sourceName,
      });
      patchArticle(idx, { rewriting: false, rewritten: res, expanded: true });
    } catch (err) { patchArticle(idx, { rewriting: false, error: String(err) }); }
  }

  async function doPublish(idx: number, rw: RewriteResult) {
    const s = articles[idx]!;
    patchArticle(idx, { publishing: true, error: null });
    try {
      await apiPost("publish", {
        title: rw.title || s.article.title, subtitle: rw.subtitle || s.article.summary,
        content: rw.rewritten, imageUrl: s.article.imageUrl, category: s.category,
        keywords: rw.keywords, slug: rw.slug, sourceUrl: s.article.sourceUrl,
        sourceName: s.article.sourceName, status: s.status,
      });
      patchArticle(idx, { publishing: false, published: true });
    } catch (err) { patchArticle(idx, { publishing: false, error: String(err) }); }
  }

  async function handleRewriteAndPublish(idx: number) {
    const s = articles[idx]!;
    patchArticle(idx, { rewriting: true, error: null });
    try {
      const rw = await apiPost<RewriteResult>("rewrite", {
        title: s.article.title, text: s.article.fullText || s.article.summary,
        sourceName: s.article.sourceName,
      });
      patchArticle(idx, { rewriting: false, rewritten: rw });
      await doPublish(idx, rw);
    } catch (err) { patchArticle(idx, { rewriting: false, error: String(err) }); }
  }

  // ── Topic form ──
  function openNew() { setForm(emptyForm); setEditTopic(null); setFormError(null); setShowForm(true); }
  function openEdit(t: Topic) {
    setForm({ name: t.name, query: t.query, category: t.category,
      scheduleHours: t.scheduleHours, maxResults: t.maxResults,
      autoMode: t.autoMode as "none"|"draft"|"published", active: t.active });
    setEditTopic(t); setFormError(null); setShowForm(true);
  }
  async function handleSaveTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.query.trim()) { setFormError("Nome e busca são obrigatórios"); return; }
    setSaving(true); setFormError(null);
    try {
      if (editTopic) {
        const res = await apiReq<{ topic: Topic }>("PATCH", `topics/${editTopic.id}`, form);
        setTopics((prev) => prev.map((t) => (t.id === editTopic.id ? res.topic : t)));
      } else {
        const res = await apiReq<{ topic: Topic }>("POST", "topics", form);
        setTopics((prev) => [...prev, res.topic]);
      }
      setShowForm(false);
    } catch (err) { setFormError(String(err)); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este tópico agendado?")) return;
    await apiReq("DELETE", `topics/${id}`).catch(() => {});
    setTopics((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleToggle(t: Topic) {
    const res = await apiReq<{ topic: Topic }>("PATCH", `topics/${t.id}`, { active: !t.active }).catch(() => null);
    if (res) setTopics((prev) => prev.map((x) => (x.id === t.id ? res.topic : x)));
  }

  async function handleRunNow(t: Topic) {
    setRunningId(t.id);
    setRunResult((p) => ({ ...p, [t.id]: "" }));
    try {
      const res = await apiReq<{ processed: number; articles: Array<{ saved?: boolean; skipped?: boolean }> }>(
        "POST", `topics/${t.id}/run`, {}
      );
      const saved   = res.articles.filter((a) => a.saved).length;
      const skipped = res.articles.filter((a) => a.skipped).length;
      setRunResult((p) => ({ ...p, [t.id]: `✓ ${saved} salvo(s), ${skipped} duplicado(s)` }));
      // refresh lastRunAt
      setTopics((prev) => prev.map((x) => x.id === t.id ? { ...x, lastRunAt: new Date().toISOString() } : x));
    } catch (err) {
      setRunResult((p) => ({ ...p, [t.id]: `Erro: ${String(err)}` }));
    } finally { setRunningId(null); }
  }

  const autoModeLabel: Record<string, string> = {
    none: "Coletar (sem salvar)", draft: "Salvar como rascunho", published: "Publicar automaticamente",
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Perplexity — Busca de Notícias">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border shadow-sm p-1 w-fit">
          {(["search","topics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-[#0b3d91] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t === "search" ? "🔍 Busca Manual" : "⏱ Tópicos Agendados"}
            </button>
          ))}
        </div>

        {/* ═══ MANUAL SEARCH ═══════════════════════════════════════════════════ */}
        {tab === "search" && (
          <>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-[#0b3d91] flex items-center justify-center shrink-0">
                  <Zap size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Busca Inteligente</h2>
                  <p className="text-xs text-gray-500">Pesquisa notícias recentes via Perplexity (Google, Twitter/X, portais)</p>
                </div>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ex: São Bernardo do Campo obras, saúde pública SBC..."
                    className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]/30 focus:border-[#0b3d91]"
                  />
                </div>
                <select
                  value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  {[3,5,8,10].map((n) => <option key={n} value={n}>{n} notícias</option>)}
                </select>
                <button
                  type="submit" disabled={searching || !query.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0b3d91] text-white rounded-lg text-sm font-medium hover:bg-[#0b3d91]/90 disabled:opacity-50 transition-colors"
                >
                  {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  {searching ? "Buscando..." : "Buscar"}
                </button>
              </form>
              {searchError && (
                <div className="mt-3 flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />{searchError}
                </div>
              )}
            </div>

            {articles.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">
                  {articles.length} resultado{articles.length !== 1 ? "s" : ""} para &ldquo;{query}&rdquo;
                </p>
                {articles.map((s, idx) => (
                  <ArticleCard key={idx} s={s} idx={idx}
                    onPatch={patchArticle}
                    onRewrite={handleRewrite}
                    onRewriteAndPublish={handleRewriteAndPublish}
                    onPublish={(i) => s.rewritten && doPublish(i, s.rewritten)}
                  />
                ))}
              </div>
            )}

            {!searching && articles.length === 0 && !searchError && (
              <div className="text-center py-14 text-gray-400">
                <Search size={36} className="mx-auto mb-3 opacity-25" />
                <p className="text-sm">Digite um tema para buscar notícias recentes</p>
                <p className="text-xs mt-1 opacity-60">Ex: "saúde SBC", "obras cidade", "concurso público"</p>
              </div>
            )}
          </>
        )}

        {/* ═══ SCHEDULED TOPICS ════════════════════════════════════════════════ */}
        {tab === "topics" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Tópicos são buscados automaticamente no intervalo configurado. A IA reescreve e salva conforme o modo escolhido.
              </p>
              <button
                onClick={openNew}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#0b3d91] text-white rounded-lg text-xs font-medium hover:bg-[#0b3d91]/90 transition-colors"
              >
                <Plus size={14} /> Novo tópico
              </button>
            </div>

            {/* Form */}
            {showForm && (
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {editTopic ? "Editar tópico" : "Novo tópico agendado"}
                  </h3>
                  <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </div>
                <form onSubmit={handleSaveTopic} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Nome do tópico</label>
                    <input
                      type="text" value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Notícias SBC — Saúde"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]/30"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Termo de busca</label>
                    <input
                      type="text" value={form.query}
                      onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))}
                      placeholder="Ex: São Bernardo do Campo saúde pública"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Editoria</label>
                    <select value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Intervalo de busca</label>
                    <select value={form.scheduleHours}
                      onChange={(e) => setForm((p) => ({ ...p, scheduleHours: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value={0}>Manual (sem agendamento)</option>
                      {HOURS_OPTIONS.map((h) => (
                        <option key={h} value={h}>A cada {h}h</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Nº de notícias</label>
                    <select value={form.maxResults}
                      onChange={(e) => setForm((p) => ({ ...p, maxResults: Number(e.target.value) }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                      {[3,5,8,10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Modo automático</label>
                    <select value={form.autoMode}
                      onChange={(e) => setForm((p) => ({ ...p, autoMode: e.target.value as "none"|"draft"|"published" }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none"
                    >
                      <option value="none">Apenas coletar (sem salvar)</option>
                      <option value="draft">Reescrever → Rascunho</option>
                      <option value="published">Reescrever → Publicar</option>
                    </select>
                  </div>
                  {formError && (
                    <div className="col-span-2 flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="shrink-0" />{formError}
                    </div>
                  )}
                  <div className="col-span-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setShowForm(false)}
                      className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >Cancelar</button>
                    <button type="submit" disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0b3d91] text-white rounded-lg text-sm font-medium hover:bg-[#0b3d91]/90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Salvar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Topics list */}
            {topicsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-gray-400" />
              </div>
            ) : topics.length === 0 ? (
              <div className="text-center py-14 text-gray-400">
                <Clock size={36} className="mx-auto mb-3 opacity-25" />
                <p className="text-sm">Nenhum tópico agendado</p>
                <p className="text-xs mt-1 opacity-60">Crie um tópico para busca automática periódica</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topics.map((t) => (
                  <div key={t.id} className={`bg-white rounded-xl border shadow-sm p-4 ${!t.active ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => handleToggle(t)} className="mt-0.5 shrink-0 text-gray-400 hover:text-[#0b3d91]">
                        {t.active
                          ? <ToggleRight size={22} className="text-[#0b3d91]" />
                          : <ToggleLeft size={22} />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-800">{t.name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{t.category}</span>
                          {t.scheduleHours > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex items-center gap-1">
                              <Clock size={9} />a cada {t.scheduleHours}h
                            </span>
                          )}
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            t.autoMode === "published" ? "bg-green-100 text-green-700"
                            : t.autoMode === "draft"    ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                          }`}>{autoModeLabel[t.autoMode]}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">🔍 {t.query}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Última execução: {timeSince(t.lastRunAt)} · {t.maxResults} notícias
                        </p>
                        {runResult[t.id] && (
                          <p className={`text-xs mt-1 font-medium ${runResult[t.id]?.startsWith("Erro") ? "text-red-600" : "text-green-700"}`}>
                            {runResult[t.id]}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRunNow(t)}
                          disabled={runningId === t.id}
                          title="Executar agora"
                          className="p-1.5 text-gray-400 hover:text-[#0b3d91] hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {runningId === t.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Play size={15} />
                          }
                        </button>
                        <button onClick={() => openEdit(t)} title="Editar"
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(t.id)} title="Remover"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ─── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({ s, idx, onPatch, onRewrite, onRewriteAndPublish, onPublish }: {
  s: ArticleState; idx: number;
  onPatch: (i: number, p: Partial<ArticleState>) => void;
  onRewrite: (i: number) => void;
  onRewriteAndPublish: (i: number) => void;
  onPublish: (i: number) => void;
}) {
  const busy = s.rewriting || s.publishing;
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${s.published ? "border-green-300" : ""}`}>
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0b3d91]/10 text-[#0b3d91] uppercase tracking-wide">
                <Zap size={9} />Perplexity
              </span>
              {s.article.sourceName && <span className="text-[11px] text-gray-400">{s.article.sourceName}</span>}
              {s.published && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  <CheckCircle size={9} />Publicado
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-gray-800 leading-snug">{s.article.title}</h3>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.article.summary}</p>
          </div>
          {s.article.sourceUrl && (
            <a href={s.article.sourceUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#0b3d91] shrink-0 mt-0.5">
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        {!s.published && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={s.category}
              onChange={(e) => onPatch(idx, { category: e.target.value })}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select value={s.status}
              onChange={(e) => onPatch(idx, { status: e.target.value as "draft"|"published" })}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicar</option>
            </select>
            <button onClick={() => onPatch(idx, { expanded: !s.expanded })}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded border hover:bg-gray-50"
            >
              {s.expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {s.expanded ? "Recolher" : "Ver texto"}
            </button>
            <button onClick={() => onRewrite(idx)} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#0b3d91] text-[#0b3d91] hover:bg-[#0b3d91]/5 disabled:opacity-50 transition-colors"
            >
              {s.rewriting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              Reescrever
            </button>
            <button onClick={() => onRewriteAndPublish(idx)} disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#c8102e] text-white hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {s.rewriting ? "Reescrevendo..." : s.publishing ? "Publicando..." : "Reescrever e Publicar"}
            </button>
          </div>
        )}

        {s.error && (
          <div className="mt-2 flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={12} className="shrink-0" />{s.error}
          </div>
        )}
      </div>

      {s.expanded && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Texto coletado</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{s.article.fullText || s.article.summary}</p>
        </div>
      )}

      {s.rewritten && (
        <div className="border-t">
          <div className="px-4 py-3 bg-blue-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                <Wand2 size={11} />Reescrito pela IA
              </p>
              {!s.published && (
                <button onClick={() => onPublish(idx)} disabled={s.publishing}
                  className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {s.publishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {s.publishing ? "Publicando..." : "Publicar"}
                </button>
              )}
            </div>
            {s.rewritten.title    && <p className="text-sm font-bold text-gray-800 mb-0.5">{s.rewritten.title}</p>}
            {s.rewritten.subtitle && <p className="text-xs text-gray-600 italic mb-2">{s.rewritten.subtitle}</p>}
            <div className="text-xs text-gray-700 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: s.rewritten.rewritten }} />
          </div>
        </div>
      )}
    </div>
  );
}
