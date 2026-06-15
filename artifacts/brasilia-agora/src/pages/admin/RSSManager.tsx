import React, { useState, useEffect, useCallback, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Plus, Trash2, RefreshCw, Wand2, Send, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Rss, ExternalLink,
  Settings, Key, Brain, Clock, BadgeCheck, Zap, Eye, EyeOff,
  Play,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type AutoMode = "none" | "draft" | "publish" | "rewrite_draft" | "rewrite_publish";
type AiProvider = "gemini_free" | "gemini_paid" | "openai";

interface RssSource {
  id: string; name: string; url: string; category: string;
  active: boolean; createdAt: string;
  scheduleHours: number; giveCredit: boolean;
  autoMode: AutoMode; lastFetchedAt?: string;
}

interface FetchedArticle {
  sourceId: string; sourceName: string; category: string;
  title: string; link: string; pubDate: string;
  imageUrl: string; excerpt: string; fullText: string;
}

interface ArticleState extends FetchedArticle {
  rewritten?: string; rewriting?: boolean;
  importing?: boolean; imported?: boolean;
  error?: string; expanded?: boolean;
  editTitle?: string; editSubtitle?: string; editContent?: string;
  aiKeywords?: string; aiSlug?: string;
}

interface AiSettings {
  provider: AiProvider; model: string; hasKey: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_CATEGORIES = [
  "politica","cidade","seguranca","transporte","saude",
  "educacao","cultura","esportes","economia","tecnologia","geral",
];
const TAG_MAP: Record<string, string> = {
  politica:"POLÍTICA", cidade:"CIDADE", seguranca:"SEGURANÇA",
  transporte:"TRANSPORTE", saude:"SAÚDE", educacao:"EDUCAÇÃO",
  cultura:"CULTURA", esportes:"ESPORTES", economia:"ECONOMIA",
  tecnologia:"TECNOLOGIA", geral:"GERAL",
};
const SCHEDULE_OPTS = [
  { label: "Manual (sem agendamento)", value: 0 },
  { label: "A cada 1 hora",  value: 1 },
  { label: "A cada 2 horas", value: 2 },
  { label: "A cada 4 horas", value: 4 },
  { label: "A cada 6 horas", value: 6 },
  { label: "A cada 12 horas", value: 12 },
  { label: "A cada 24 horas", value: 24 },
];
const AUTO_MODE_OPTS: { label: string; value: AutoMode; desc: string }[] = [
  { value: "none",             label: "Manual",                    desc: "Sem automação" },
  { value: "draft",            label: "Rascunho auto",             desc: "Salva como rascunho" },
  { value: "publish",          label: "Publicar auto",             desc: "Publica direto" },
  { value: "rewrite_draft",    label: "IA → Rascunho",             desc: "Reescreve e salva" },
  { value: "rewrite_publish",  label: "IA → Publicar",             desc: "Reescreve e publica" },
];
const AI_PROVIDERS: { label: string; value: AiProvider; desc: string }[] = [
  { value: "gemini_free", label: "Gemini Gratuito (Replit)", desc: "Sem custo de API key — usa créditos Replit" },
  { value: "gemini_paid", label: "Gemini Pago (Google)",     desc: "Use sua própria API key do Google AI" },
  { value: "openai",      label: "ChatGPT (OpenAI)",         desc: "Use sua própria API key da OpenAI" },
];
const OPENAI_MODELS = ["gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo"];
const GEMINI_MODELS = ["gemini-2.5-flash","gemini-2.5-pro","gemini-3-flash-preview","gemini-3.1-pro-preview"];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api/admin/rss${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ─── Helper components ────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

function AutoModeBadge({ mode }: { mode: AutoMode }) {
  const map: Record<AutoMode, { label: string; cls: string }> = {
    none:            { label: "Manual",         cls: "bg-gray-100 text-gray-500" },
    draft:           { label: "→ Rascunho",     cls: "bg-blue-50 text-blue-600" },
    publish:         { label: "→ Publicar",     cls: "bg-green-50 text-green-600" },
    rewrite_draft:   { label: "IA → Rascunho",  cls: "bg-purple-50 text-purple-600" },
    rewrite_publish: { label: "IA → Publicar",  cls: "bg-purple-100 text-purple-700" },
  };
  const { label, cls } = map[mode] ?? map["none"];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RSSManager() {
  // ── AI Settings ──
  const [aiSettings, setAiSettings]   = useState<AiSettings>({ provider: "gemini_free", model: "", hasKey: false });
  const [aiApiKey, setAiApiKey]       = useState("");
  const [showApiKey, setShowApiKey]   = useState(false);
  const [aiSaving, setAiSaving]       = useState(false);
  const [aiSaved, setAiSaved]         = useState(false);
  const [aiError, setAiError]         = useState("");

  // ── Sources ──
  const [sources, setSources]         = useState<RssSource[]>([]);
  const [newName, setNewName]         = useState("");
  const [newUrl, setNewUrl]           = useState("");
  const [newCat, setNewCat]           = useState("geral");
  const [newSchedule, setNewSchedule] = useState(0);
  const [newCredit, setNewCredit]     = useState(true);
  const [newAutoMode, setNewAutoMode] = useState<AutoMode>("none");
  const [addError, setAddError]       = useState("");
  const [adding, setAdding]           = useState(false);
  const [editingSource, setEditingSource] = useState<RssSource | null>(null);
  const [runningId, setRunningId]     = useState<string | null>(null);

  // ── Dynamic categories from menu ──
  const [menuCategories, setMenuCategories] = useState<{ slug: string; label: string }[]>([]);

  // ── Stats ──
  const [rssStats, setRssStats] = useState({ total: 0, rewritten: 0 });

  // ── Fetch & Preview ──
  const [selectedSource, setSelectedSource] = useState("all");
  const [fetching, setFetching]       = useState(false);
  const [fetchError, setFetchError]   = useState("");
  const [articles, setArticles]       = useState<ArticleState[]>([]);

  // ─── Load ───────────────────────────────────────────────────────────────────

  const loadRssStats = useCallback(async () => {
    try {
      const base = import.meta.env.BASE_URL ?? "/";
      const res = await fetch(`${base}api/admin/articles`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json() as { articles: { origin?: string; aiRewritten?: boolean }[] };
      const rssArticles = (d.articles ?? []).filter((a) => a.origin === "rss");
      setRssStats({
        total: rssArticles.length,
        rewritten: rssArticles.filter((a) => a.aiRewritten).length,
      });
    } catch { /* ignore */ }
  }, []);

  const loadAiSettings = useCallback(async () => {
    try {
      const d = await apiFetch<AiSettings>("/ai-settings");
      setAiSettings(d);
    } catch { /* ignore */ }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const d = await apiFetch<{ sources: RssSource[] }>("/sources");
      setSources(d.sources);
    } catch { /* ignore */ }
  }, []);

  const loadMenuCategories = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/menu`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json() as { menuItems: { label: string; path: string }[] };
      const cats = (d.menuItems ?? [])
        .filter((m) => m.path && m.path !== "/" && m.path.startsWith("/"))
        .map((m) => ({
          slug:  m.path.slice(1).toLowerCase(),
          label: m.label.toUpperCase(),
        }));
      setMenuCategories(cats);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadAiSettings();
    void loadSources();
    void loadMenuCategories();
    void loadRssStats();
  }, [loadAiSettings, loadSources, loadMenuCategories, loadRssStats]);

  const allCategories = useMemo(() => {
    const baseSet = new Set(BASE_CATEGORIES);
    const extra = menuCategories.filter((m) => !baseSet.has(m.slug));
    return [
      ...BASE_CATEGORIES.map((s) => ({ slug: s, label: TAG_MAP[s] ?? s.toUpperCase() })),
      ...extra,
    ];
  }, [menuCategories]);

  // ─── AI Settings ────────────────────────────────────────────────────────────

  async function saveAiSettings(e: React.FormEvent) {
    e.preventDefault();
    setAiSaving(true); setAiError(""); setAiSaved(false);
    try {
      await apiFetch("/ai-settings", {
        method: "PUT",
        body: JSON.stringify({
          provider: aiSettings.provider,
          model:    aiSettings.model,
          apiKey:   aiApiKey || undefined,
        }),
      });
      setAiSaved(true); setAiApiKey("");
      await loadAiSettings();
      setTimeout(() => setAiSaved(false), 2500);
    } catch (e) { setAiError(String(e)); }
    finally { setAiSaving(false); }
  }

  // ─── Sources ────────────────────────────────────────────────────────────────

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) { setAddError("Nome e URL são obrigatórios"); return; }
    setAdding(true); setAddError("");
    try {
      await apiFetch<{ source: RssSource }>("/sources", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(), url: newUrl.trim(), category: newCat,
          scheduleHours: newSchedule, giveCredit: newCredit, autoMode: newAutoMode,
        }),
      });
      setNewName(""); setNewUrl(""); setNewCat("geral");
      setNewSchedule(0); setNewCredit(true); setNewAutoMode("none");
      await loadSources();
    } catch (e) { setAddError(String(e)); }
    finally { setAdding(false); }
  }

  async function saveEdit() {
    if (!editingSource) return;
    try {
      await apiFetch(`/sources/${editingSource.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name:         editingSource.name, url: editingSource.url,
          category:     editingSource.category, active: editingSource.active,
          scheduleHours: editingSource.scheduleHours, giveCredit: editingSource.giveCredit,
          autoMode:     editingSource.autoMode,
        }),
      });
      setEditingSource(null); await loadSources();
    } catch (e) { alert(String(e)); }
  }

  async function deleteSource(id: string) {
    if (!confirm("Remover esta fonte RSS?")) return;
    try {
      await apiFetch(`/sources/${id}`, { method: "DELETE" });
      await loadSources();
      setArticles((p) => p.filter((a) => a.sourceId !== id));
    } catch (e) { alert(String(e)); }
  }

  async function toggleSource(src: RssSource) {
    try {
      await apiFetch(`/sources/${src.id}`, {
        method: "PATCH", body: JSON.stringify({ active: !src.active }),
      });
      await loadSources();
    } catch (e) { alert(String(e)); }
  }

  async function runSource(id: string) {
    setRunningId(id);
    try {
      const d = await apiFetch<{ processed: number }>("/run", {
        method: "POST", body: JSON.stringify({ sourceId: id }),
      });
      alert(`✅ ${d.processed} artigo(s) processado(s) com sucesso`);
      await loadSources();
    } catch (e) { alert(`Erro: ${String(e)}`); }
    finally { setRunningId(null); }
  }

  // ─── Fetch / Preview ────────────────────────────────────────────────────────

  async function fetchArticles() {
    setFetching(true); setFetchError(""); setArticles([]);
    try {
      const d = await apiFetch<{ articles: FetchedArticle[] }>("/fetch", {
        method: "POST",
        body: JSON.stringify(selectedSource === "all" ? {} : { sourceId: selectedSource }),
      });
      setArticles(d.articles.map((a) => ({
        ...a,
        editTitle: a.title,
        editSubtitle: a.excerpt.slice(0, 160),
        editContent: a.fullText,
        expanded: false,
      })));
    } catch (e) { setFetchError(String(e)); }
    finally { setFetching(false); }
  }

  function updateArticle(idx: number, patch: Partial<ArticleState>) {
    setArticles((p) => p.map((a, i) => i === idx ? { ...a, ...patch } : a));
  }

  async function rewrite(idx: number) {
    const art = articles[idx];
    if (!art) return;
    updateArticle(idx, { rewriting: true, error: undefined });
    try {
      const src = sources.find((s) => s.id === art.sourceId);
      const d = await apiFetch<{ rewritten: string; keywords?: string; slug?: string }>("/rewrite", {
        method: "POST",
        body: JSON.stringify({
          title: art.title, text: art.fullText || art.excerpt,
          sourceName: art.sourceName, giveCredit: src?.giveCredit !== false,
        }),
      });
      updateArticle(idx, {
        rewriting: false, rewritten: d.rewritten,
        editContent: d.rewritten, expanded: true,
        aiKeywords: d.keywords ?? "",
        aiSlug: d.slug ?? "",
      });
    } catch (e) { updateArticle(idx, { rewriting: false, error: String(e) }); }
  }

  async function importArticle(idx: number, status: "draft" | "published") {
    const art = articles[idx];
    if (!art) return;
    updateArticle(idx, { importing: true, error: undefined });
    const src = sources.find((s) => s.id === art.sourceId);
    try {
      await apiFetch("/import", {
        method: "POST",
        body: JSON.stringify({
          title:         art.editTitle ?? art.title,
          subtitle:      art.editSubtitle ?? art.excerpt.slice(0, 160),
          content:       art.editContent ?? art.fullText,
          category:      art.category,
          tag:           TAG_MAP[art.category] ?? "GERAL",
          imageUrl:      art.imageUrl,
          author:        src?.giveCredit !== false ? `Redação (via ${art.sourceName})` : "Redação",
          status,
          rssSourceId:   art.sourceId,
          rssSourceName: art.sourceName,
          rssSourceUrl:  art.link,
          aiRewritten:   !!art.rewritten,
          keywords:      art.aiKeywords || undefined,
          slug:          art.aiSlug || undefined,
        }),
      });
      updateArticle(idx, { importing: false, imported: true });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("duplicado") || msg.includes("409")) {
        updateArticle(idx, { importing: false, imported: true, error: "⚠ Já importado anteriormente" });
      } else {
        updateArticle(idx, { importing: false, error: msg });
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const needsKey = aiSettings.provider !== "gemini_free";
  const modelList = aiSettings.provider === "openai" ? OPENAI_MODELS : GEMINI_MODELS;

  return (
    <AdminLayout title="Importar via RSS">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ══ STATS ══════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total coletado</span>
            <span className="text-3xl font-bold text-[#1a2448]">{rssStats.total}</span>
            <span className="text-[11px] text-gray-400">artigos via RSS no sistema</span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reescritos com IA</span>
            <span className="text-3xl font-bold text-purple-600">{rssStats.rewritten}</span>
            <span className="text-[11px] text-gray-400">com SEO/AIO aplicado</span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa de reescrita</span>
            <span className="text-3xl font-bold text-[#c8102e]">
              {rssStats.total > 0 ? Math.round((rssStats.rewritten / rssStats.total) * 100) : 0}%
            </span>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
              <div
                className="bg-purple-500 h-1.5 rounded-full transition-all"
                style={{ width: `${rssStats.total > 0 ? Math.round((rssStats.rewritten / rssStats.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </section>

        {/* ══ AI SETTINGS ════════════════════════════════════════════════════ */}
        <section className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Brain size={18} className="text-purple-600" />
            <h2 className="font-semibold text-gray-800">Configuração de IA para Reescrita</h2>
          </div>
          <form onSubmit={(e) => { void saveAiSettings(e); }} className="p-6 space-y-4">
            {/* Provider */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Provedor de IA</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.value} type="button"
                    onClick={() => setAiSettings((a) => ({ ...a, provider: p.value, model: "" }))}
                    className={`flex flex-col gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                      aiSettings.provider === p.value
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-sm font-semibold text-gray-800">{p.label}</span>
                    <span className="text-[11px] text-gray-500">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Modelo</label>
                <select
                  value={aiSettings.model}
                  onChange={(e) => setAiSettings((a) => ({ ...a, model: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Padrão (recomendado)</option>
                  {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* API Key */}
              {needsKey && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    API Key {aiSettings.hasKey && <span className="text-green-600 ml-1">✓ Configurada</span>}
                  </label>
                  <div className="relative">
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder={aiSettings.hasKey ? "••••••• (manter atual)" : "Insira sua API Key"}
                      className="w-full pl-8 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {aiError && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle size={14}/>{aiError}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit" disabled={aiSaving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                  aiSaved ? "bg-green-500 text-white" : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                {aiSaved ? <><CheckCircle size={15}/> Salvo!</> : <><Settings size={15}/> {aiSaving ? "Salvando…" : "Salvar Configuração"}</>}
              </button>
              <p className="text-[11px] text-gray-400">
                Prompt padrão: jornalista sênior com foco em SEO e AIO
              </p>
            </div>
          </form>
        </section>

        {/* ══ SOURCES ════════════════════════════════════════════════════════ */}
        <section className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Rss size={18} className="text-[#c8102e]" />
            <h2 className="font-semibold text-gray-800">Fontes RSS</h2>
          </div>
          <div className="p-6 space-y-5">

            {/* Add form */}
            <form onSubmit={(e) => { void addSource(e); }} className="space-y-3 bg-gray-50 rounded-xl p-4 border">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nova Fonte</p>
              <div className="flex flex-wrap gap-3">
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da fonte" className="flex-1 min-w-[150px] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] bg-white"/>
                <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL do feed RSS" className="flex-[2] min-w-[250px] border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] bg-white"/>
                <select value={newCat} onChange={(e) => setNewCat(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] bg-white">
                  {allCategories.map(({ slug, label }) => <option key={slug} value={slug}>{label}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><Clock size={11}/>Agendamento</label>
                  <select value={newSchedule} onChange={(e) => setNewSchedule(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] bg-white">
                    {SCHEDULE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><Zap size={11}/>Automação</label>
                  <select value={newAutoMode} onChange={(e) => setNewAutoMode(e.target.value as AutoMode)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] bg-white">
                    {AUTO_MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={newCredit} onChange={(e) => setNewCredit(e.target.checked)}
                      className="rounded text-[#0b3d91]"/>
                    <BadgeCheck size={15} className="text-[#0b3d91]"/> Dar crédito à fonte
                  </label>
                </div>
                <button type="submit" disabled={adding}
                  className="flex items-center gap-2 bg-[#0b3d91] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#0b3d91]/90 disabled:opacity-50 transition-colors mt-4">
                  <Plus size={16}/> {adding ? "Adicionando…" : "Adicionar"}
                </button>
              </div>
              {addError && <p className="text-sm text-red-500">{addError}</p>}
            </form>

            {/* Source list */}
            {sources.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma fonte cadastrada</p>
            ) : (
              <div className="rounded-xl border overflow-hidden divide-y">
                {sources.map((src) => (
                  <div key={src.id}>
                    {editingSource?.id === src.id ? (
                      /* ── Edit mode ── */
                      <div className="p-4 bg-blue-50 space-y-3">
                        <div className="flex flex-wrap gap-3">
                          <input value={editingSource.name} onChange={(e) => setEditingSource((s) => s && ({ ...s, name: e.target.value }))}
                            className="flex-1 min-w-[150px] border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"/>
                          <input value={editingSource.url} onChange={(e) => setEditingSource((s) => s && ({ ...s, url: e.target.value }))}
                            className="flex-[2] min-w-[250px] border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"/>
                          <select value={editingSource.category} onChange={(e) => setEditingSource((s) => s && ({ ...s, category: e.target.value }))}
                            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]">
                            {allCategories.map(({ slug, label }) => <option key={slug} value={slug}>{label}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                          <select value={editingSource.scheduleHours}
                            onChange={(e) => setEditingSource((s) => s && ({ ...s, scheduleHours: Number(e.target.value) }))}
                            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]">
                            {SCHEDULE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <select value={editingSource.autoMode}
                            onChange={(e) => setEditingSource((s) => s && ({ ...s, autoMode: e.target.value as AutoMode }))}
                            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]">
                            {AUTO_MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="checkbox" checked={editingSource.giveCredit}
                              onChange={(e) => setEditingSource((s) => s && ({ ...s, giveCredit: e.target.checked }))}/>
                            Dar crédito
                          </label>
                          <button onClick={() => { void saveEdit(); }}
                            className="bg-[#0b3d91] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#0b3d91]/90 transition-colors">
                            Salvar
                          </button>
                          <button onClick={() => setEditingSource(null)}
                            className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-300 transition-colors">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                        {/* Toggle */}
                        <button onClick={() => { void toggleSource(src); }}
                          className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${src.active ? "bg-green-500" : "bg-gray-300"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${src.active ? "translate-x-4" : "translate-x-0.5"}`}/>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-800">{src.name}</p>
                            <Badge label={TAG_MAP[src.category] ?? src.category} color="bg-gray-100 text-gray-600"/>
                            <AutoModeBadge mode={src.autoMode}/>
                            {src.giveCredit && (
                              <span className="text-[10px] text-blue-500 font-medium">crédito ✓</span>
                            )}
                            {src.scheduleHours > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                                <Clock size={10}/>{src.scheduleHours}h
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{src.url}</p>
                          {src.lastFetchedAt && (
                            <p className="text-[10px] text-gray-400">
                              Última busca: {new Date(src.lastFetchedAt).toLocaleString("pt-BR")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {src.autoMode !== "none" && (
                            <button
                              onClick={() => { void runSource(src.id); }}
                              disabled={runningId === src.id}
                              title="Executar agora"
                              className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors disabled:opacity-50"
                            >
                              <Play size={15} className={runningId === src.id ? "animate-pulse" : ""}/>
                            </button>
                          )}
                          <button onClick={() => setEditingSource(src)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#0b3d91] hover:bg-blue-50 transition-colors">
                            <Settings size={15}/>
                          </button>
                          <button onClick={() => { void deleteSource(src.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ══ MANUAL FETCH ═══════════════════════════════════════════════════ */}
        <section className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <RefreshCw size={18} className="text-[#0b3d91]"/>
            <h2 className="font-semibold text-gray-800">Buscar e Pré-visualizar Artigos</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-wrap gap-3 items-center">
              <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]">
                <option value="all">Todas as fontes ativas</option>
                {sources.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={() => { void fetchArticles(); }}
                disabled={fetching || sources.filter((s) => s.active).length === 0}
                className="flex items-center gap-2 bg-[#c8102e] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors">
                <RefreshCw size={16} className={fetching ? "animate-spin" : ""}/>
                {fetching ? "Buscando artigos…" : "Buscar Agora"}
              </button>
            </div>
            {fetchError && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                <AlertCircle size={16}/>{fetchError}
              </div>
            )}
          </div>
        </section>

        {/* ══ RESULTS ════════════════════════════════════════════════════════ */}
        {articles.length > 0 && (
          <section className="space-y-3">
            <p className="text-sm text-gray-500 px-1">
              {articles.length} artigo(s) encontrado(s)
            </p>
            {articles.map((art, idx) => (
              <div key={`${art.sourceId}-${idx}`}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden ${art.imported ? "opacity-60" : ""}`}>
                <div className="flex gap-4 p-4">
                  {/* Featured image */}
                  {art.imageUrl ? (
                    <img src={art.imageUrl} alt=""
                      className="w-28 h-20 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
                  ) : (
                    <div className="w-28 h-20 rounded-lg flex-shrink-0 bg-gray-100 flex items-center justify-center">
                      <Rss size={24} className="text-gray-300"/>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-[#c8102e] uppercase tracking-wide">
                        {TAG_MAP[art.category] ?? art.category}
                      </span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">{art.sourceName}</span>
                      {art.link && (
                        <a href={art.link} target="_blank" rel="noreferrer"
                          className="text-gray-300 hover:text-[#0b3d91] ml-auto flex-shrink-0 transition-colors">
                          <ExternalLink size={13}/>
                        </a>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">{art.title}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{art.excerpt}</p>
                  </div>
                </div>

                {/* Expand panel */}
                <div className="border-t px-4 py-3">
                  <button
                    onClick={() => updateArticle(idx, { expanded: !art.expanded })}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    {art.expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                    {art.expanded ? "Recolher" : "Editar / Publicar"}
                  </button>

                  {art.expanded && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Título</label>
                        <input value={art.editTitle ?? art.title}
                          onChange={(e) => updateArticle(idx, { editTitle: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"/>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Subtítulo / Chapéu</label>
                        <input value={art.editSubtitle ?? ""}
                          onChange={(e) => updateArticle(idx, { editSubtitle: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91]"/>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">
                          Conteúdo
                          {art.rewritten && <span className="ml-2 text-purple-600 font-semibold">✦ Reescrito com IA (SEO/AIO)</span>}
                        </label>
                        <textarea value={art.editContent ?? art.fullText}
                          onChange={(e) => updateArticle(idx, { editContent: e.target.value })}
                          rows={10}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b3d91] font-mono leading-relaxed"/>
                      </div>

                      {/* Keywords + Slug gerados pela IA */}
                      {art.rewritten && (art.aiKeywords || art.aiSlug) && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                          {art.aiSlug && (
                            <div>
                              <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Slug SEO</span>
                              <p className="text-sm font-mono text-purple-800 mt-0.5">{art.aiSlug}</p>
                            </div>
                          )}
                          {art.aiKeywords && (
                            <div>
                              <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Palavras-chave</span>
                              <p className="text-sm text-purple-800 mt-0.5">{art.aiKeywords}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {art.error && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle size={12}/>{art.error}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {art.imported ? (
                      <span className="flex items-center gap-1 text-sm text-green-600 font-semibold">
                        <CheckCircle size={16}/> Importado!
                      </span>
                    ) : (
                      <>
                        <button onClick={() => { void rewrite(idx); }}
                          disabled={art.rewriting || art.importing}
                          className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                          <Wand2 size={13} className={art.rewriting ? "animate-pulse" : ""}/>
                          {art.rewriting ? "Reescrevendo com IA…" : "Reescrever com IA (SEO/AIO)"}
                        </button>
                        <button onClick={() => { void importArticle(idx, "draft"); }}
                          disabled={art.importing || art.rewriting}
                          className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors">
                          <Send size={13}/>
                          {art.importing ? "Salvando…" : "Salvar Rascunho"}
                        </button>
                        <button onClick={() => { void importArticle(idx, "published"); }}
                          disabled={art.importing || art.rewriting}
                          className="flex items-center gap-1.5 bg-[#c8102e] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#c8102e]/90 disabled:opacity-50 transition-colors">
                          <Send size={13}/>
                          {art.importing ? "Publicando…" : "Publicar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

      </div>
    </AdminLayout>
  );
}
