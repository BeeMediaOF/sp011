import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Plus, Trash2, RefreshCw, Wand2, Send, CheckCircle,
  AlertCircle, ChevronDown, ChevronUp, Rss, ExternalLink,
  Settings, Key, Brain, Clock, BadgeCheck, Zap, Eye, EyeOff,
  Play, ListChecks, Square, CheckSquare, StopCircle, Timer,
  Loader2, SplitSquareHorizontal, BookOpen, Pencil, X, Search,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const token = () => localStorage.getItem("admin_token") ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type AutoMode = "none" | "draft" | "publish" | "rewrite_draft" | "rewrite_publish";
type AiProvider = "gemini_free" | "gemini_paid" | "openai";

interface RssSource {
  id: string; name: string; url: string; category: string;
  active: boolean; createdAt: string;
  scheduleHours: number; fetchLimit?: number; giveCredit: boolean;
  autoMode: AutoMode; lastFetchedAt?: string;
  customPrompt?: string;
}

interface FetchedArticle {
  sourceId: string; sourceName: string; category: string;
  title: string; link: string; pubDate: string;
  imageUrl: string; excerpt: string; fullText: string;
  isDuplicate?: boolean;
}

type QueueStatus = "pending" | "rewriting" | "publishing" | "done" | "skipped" | "error";

interface ArticleState extends FetchedArticle {
  rewritten?: string; rewriting?: boolean;
  importing?: boolean; imported?: boolean;
  error?: string; expanded?: boolean;
  editTitle?: string; editSubtitle?: string; editContent?: string;
  aiKeywords?: string; aiSlug?: string;
  queueStatus?: QueueStatus;
  selectedForQueue?: boolean;
  compareOpen?: boolean;
}

interface AiSettings {
  provider: AiProvider; model: string; hasKey: boolean;
}

interface RssPrompts {
  global?: string;
  categories?: Record<string, string>;
}

interface RssLogEntry {
  id: string; ts: string;
  type: "fetch" | "rewrite" | "publish" | "draft" | "skip" | "error" | "duplicate";
  sourceName: string; articleTitle: string; message?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_CATEGORIES = [
  "politica","mundo","cidade","seguranca","transporte","saude",
  "educacao","cultura","esportes","economia","tecnologia","geral",
];
const TAG_MAP: Record<string, string> = {
  politica:"POLÍTICA", mundo:"MUNDO", cidade:"CIDADE", seguranca:"SEGURANÇA",
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
const FETCH_LIMIT_OPTS = [
  { label: "1 notícia",   value: 1 },
  { label: "3 notícias",  value: 3 },
  { label: "5 notícias",  value: 5 },
  { label: "10 notícias", value: 10 },
  { label: "15 notícias", value: 15 },
  { label: "20 notícias", value: 20 },
];
const AUTO_MODE_OPTS: { label: string; value: AutoMode; desc: string }[] = [
  { value: "none",             label: "Manual",                    desc: "Sem automação" },
  { value: "draft",            label: "Rascunho auto",             desc: "Salva como rascunho" },
  { value: "publish",          label: "Publicar auto",             desc: "Publica direto" },
  { value: "rewrite_draft",    label: "IA → Rascunho",             desc: "Reescreve e salva" },
  { value: "rewrite_publish",  label: "IA → Publicar",             desc: "Reescreve e publica" },
];
const AI_PROVIDERS: { label: string; value: AiProvider; desc: string }[] = [
  { value: "gemini_paid", label: "Gemini — Google AI Studio", desc: "Chave própria · tier gratuito disponível" },
  { value: "openai",      label: "ChatGPT — OpenAI",          desc: "Chave própria da OpenAI" },
  { value: "gemini_free", label: "Gemini via Replit",         desc: "Usa créditos do plano Replit" },
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

// ─── Prompt Editor ────────────────────────────────────────────────────────────

function PromptEditor({
  value, onChange, apiFetch,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  apiFetch: (path: string, opts?: RequestInit) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  async function loadDefault() {
    setLoading(true);
    try {
      const data = await apiFetch("/default-prompt") as { prompt: string };
      onChange(data.prompt);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  const isCustom = !!value;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Wand2 size={12} className="text-purple-500"/>
          Prompt do Jornalista (IA)
          {isCustom && (
            <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">personalizado</span>
          )}
        </span>
        {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
      </button>

      {open && (
        <div className="p-3 border-t space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-400">
              Variáveis: <code className="bg-gray-100 px-1 rounded">{"{{TITULO}}"}</code>{" "}
              <code className="bg-gray-100 px-1 rounded">{"{{TEXTO}}"}</code>{" "}
              <code className="bg-gray-100 px-1 rounded">{"{{FONTE}}"}</code>{" "}
              <code className="bg-gray-100 px-1 rounded">{"{{CREDITO}}"}</code>
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { void loadDefault(); }}
                disabled={loading}
                className="text-[10px] text-blue-500 hover:underline disabled:opacity-50"
              >
                {loading ? "Carregando…" : "Carregar padrão"}
              </button>
              {isCustom && (
                <button
                  type="button"
                  onClick={() => onChange(undefined)}
                  className="text-[10px] text-red-400 hover:underline"
                >
                  Remover personalização
                </button>
              )}
            </div>
          </div>
          <textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            rows={12}
            placeholder={"Deixe vazio para usar o prompt padrão.\n\nClique em 'Carregar padrão' para ver e editar o prompt atual."}
            className="w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0b3d91] resize-y bg-gray-50"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RSSManager() {
  // ── AI Settings ──
  const [aiSettings, setAiSettings]   = useState<AiSettings>({ provider: "gemini_paid", model: "", hasKey: false });
  const [aiApiKey, setAiApiKey]       = useState("");
  const [showApiKey, setShowApiKey]   = useState(false);
  const [aiSaving, setAiSaving]       = useState(false);
  const [aiSaved, setAiSaved]         = useState(false);
  const [aiError, setAiError]         = useState("");
  const [aiQuota, setAiQuota]         = useState<{
    usedToday: number; dailyLimit: number; remaining: number;
    isQuotaExhausted: boolean; isOnCooldown: boolean;
    cooldownRemainingMs: number; cooldownUntil: number | null;
  } | null>(null);

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
  const [sourceError, setSourceError] = useState("");
  const [runSuccess, setRunSuccess]   = useState<{ id: string; count: number } | null>(null);

  // ── Prompts ──
  const [prompts, setPrompts]             = useState<RssPrompts>({});
  const [promptTab, setPromptTab]         = useState<string>("__global__");
  const [promptSaving, setPromptSaving]   = useState(false);
  const [promptSaved, setPromptSaved]     = useState(false);
  const [promptDefaultLoading, setPromptDefaultLoading] = useState(false);

  // ── Dynamic categories from menu ──
  const [menuCategories, setMenuCategories] = useState<{ slug: string; label: string }[]>([]);

  // ── Stats ──
  const [rssStats, setRssStats] = useState({ total: 0, rewritten: 0, manual: 0 });

  // ── Source list UI ──
  const [sourceSearch,    setSourceSearch]    = useState("");
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set());

  // ── Prompts panel ──
  const [promptsOpen, setPromptsOpen] = useState(false);

  // ── Logs ──
  const [logs,       setLogs]       = useState<RssLogEntry[]>([]);
  const [logsOpen,   setLogsOpen]   = useState(false);
  const logPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const runStartRef = useRef<string>("");

  // ── Global defaults ──
  const [defAutoMode,   setDefAutoMode]   = useState<AutoMode>("rewrite_publish");
  const [defSchedule,   setDefSchedule]   = useState(4);
  const [defFetchLimit, setDefFetchLimit] = useState(3);
  const [defCredit,     setDefCredit]     = useState(true);
  const [applyingDefs,  setApplyingDefs]  = useState(false);
  const [defsApplied,   setDefsApplied]   = useState(false);
  const [runningAll,    setRunningAll]    = useState(false);

  // ── Table UI ──
  const [currentPage,  setCurrentPage]  = useState(1);
  const [statusFilter, setStatusFilter] = useState("Todos");

  // ── Fetch & Preview ──
  const [selectedSource, setSelectedSource] = useState("all");
  const [fetching, setFetching]       = useState(false);
  const [fetchError, setFetchError]   = useState("");
  const [articles, setArticles]       = useState<ArticleState[]>([]);

  // ── Queue ──
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueDelay, setQueueDelay]     = useState(5);
  const cancelQueueRef                  = useRef(false);

  // ─── Load ───────────────────────────────────────────────────────────────────

  const loadRssStats = useCallback(async () => {
    try {
      const base = import.meta.env.BASE_URL ?? "/";
      const res = await fetch(`${base}api/admin/articles`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const d = await res.json() as { articles: { origin?: string; aiRewritten?: boolean }[] };
      const all         = d.articles ?? [];
      const rssArticles = all.filter((a) => a.origin === "rss");
      const manual      = all.filter((a) => !a.origin || a.origin === "manual");
      setRssStats({
        total:     rssArticles.length,
        rewritten: rssArticles.filter((a) => a.aiRewritten).length,
        manual:    manual.length,
      });
    } catch { /* ignore */ }
  }, []);

  const loadAiSettings = useCallback(async () => {
    try {
      const d = await apiFetch<AiSettings>("/ai-settings");
      setAiSettings(d);
    } catch { /* ignore */ }
  }, []);

  const loadAiQuota = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/ai-quota`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) setAiQuota(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const d = await apiFetch<{ sources: RssSource[] }>("/sources");
      setSources(d.sources);
    } catch { /* ignore */ }
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const d = await apiFetch<RssPrompts>("/prompts");
      setPrompts(d);
    } catch { /* ignore */ }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const d = await apiFetch<{ logs: RssLogEntry[] }>("/logs");
      setLogs(d.logs);
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
    void loadAiQuota();
    void loadSources();
    void loadMenuCategories();
    void loadRssStats();
    void loadPrompts();
    void loadLogs();
    const quotaInterval = setInterval(() => void loadAiQuota(), 15_000);
    return () => clearInterval(quotaInterval);
  }, [loadAiSettings, loadAiQuota, loadSources, loadMenuCategories, loadRssStats, loadPrompts, loadLogs]);

  const allCategories = useMemo(() => {
    const baseSet = new Set(BASE_CATEGORIES);
    const extra = menuCategories.filter((m) => !baseSet.has(m.slug));
    return [
      ...BASE_CATEGORIES.map((s) => ({ slug: s, label: TAG_MAP[s] ?? s.toUpperCase() })),
      ...extra,
    ];
  }, [menuCategories]);

  /** Extract publisher name: "Agência Brasil - Política" → "Agência Brasil" */
  function extractPublisher(name: string): string {
    const idx = name.search(/\s[–\-]\s/);
    return idx > 0 ? name.slice(0, idx).trim() : name;
  }

  const groupedSources = useMemo(() => {
    const q = sourceSearch.toLowerCase();
    const filtered = q
      ? sources.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (TAG_MAP[s.category] ?? s.category).toLowerCase().includes(q)
        )
      : sources;
    const map = new Map<string, RssSource[]>();
    for (const src of filtered) {
      const pub = extractPublisher(src.name);
      if (!map.has(pub)) map.set(pub, []);
      map.get(pub)!.push(src);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([publisher, srcs]) => ({ publisher, sources: srcs }));
  }, [sources, sourceSearch]);

  // Prompt tab derived vars — used in render, computed here to avoid IIFE in JSX
  const promptIsGlobal   = promptTab === "__global__";
  const promptCurrentVal = promptIsGlobal ? (prompts.global ?? "") : (prompts.categories?.[promptTab] ?? "");
  const promptHasValue   = !!promptCurrentVal;
  const promptTabLabel   = promptIsGlobal
    ? "geral"
    : (allCategories.find((c) => c.slug === promptTab)?.label ?? promptTab);

  function toggleGroup(pub: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(pub)) next.delete(pub);
      else next.add(pub);
      return next;
    });
  }

  async function toggleAllInGroup(srcs: RssSource[], toActive: boolean) {
    for (const src of srcs) {
      if (src.active !== toActive) await toggleSource(src);
    }
  }

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

  // ─── Prompts ─────────────────────────────────────────────────────────────────

  async function savePrompts() {
    setPromptSaving(true); setPromptSaved(false);
    try {
      await apiFetch<RssPrompts>("/prompts", {
        method: "PUT",
        body: JSON.stringify(prompts),
      });
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 2500);
    } catch { /* ignore */ }
    finally { setPromptSaving(false); }
  }

  async function loadDefaultPromptInto(target: string) {
    setPromptDefaultLoading(true);
    try {
      const d = await apiFetch<{ prompt: string }>("/default-prompt");
      if (target === "__global__") {
        setPrompts((p) => ({ ...p, global: d.prompt }));
      } else {
        setPrompts((p) => ({ ...p, categories: { ...(p.categories ?? {}), [target]: d.prompt } }));
      }
    } catch { /* ignore */ }
    finally { setPromptDefaultLoading(false); }
  }

  function setTabPrompt(tab: string, value: string) {
    if (tab === "__global__") {
      setPrompts((p) => ({ ...p, global: value || undefined }));
    } else {
      setPrompts((p) => ({
        ...p,
        categories: { ...(p.categories ?? {}), [tab]: value || undefined as unknown as string },
      }));
    }
  }

  function clearTabPrompt(tab: string) {
    if (tab === "__global__") {
      setPrompts((p) => ({ ...p, global: undefined }));
    } else {
      const cats = { ...(prompts.categories ?? {}) };
      delete cats[tab];
      setPrompts((p) => ({ ...p, categories: cats }));
    }
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
          name:          editingSource.name,          url:      editingSource.url,
          category:      editingSource.category,      active:   editingSource.active,
          scheduleHours: editingSource.scheduleHours, fetchLimit: editingSource.fetchLimit ?? 3,
          giveCredit:    editingSource.giveCredit,    autoMode: editingSource.autoMode,
          customPrompt:  editingSource.customPrompt ?? null,
        }),
      });
      setEditingSource(null); setSourceError(""); await loadSources();
    } catch (e) { setSourceError(String(e)); }
  }

  async function deleteSource(id: string) {
    if (!confirm("Remover esta fonte RSS?")) return;
    try {
      await apiFetch(`/sources/${id}`, { method: "DELETE" });
      setSourceError("");
      await loadSources();
      setArticles((p) => p.filter((a) => a.sourceId !== id));
    } catch (e) { setSourceError(String(e)); }
  }

  async function toggleSource(src: RssSource) {
    try {
      await apiFetch(`/sources/${src.id}`, {
        method: "PATCH", body: JSON.stringify({ active: !src.active }),
      });
      setSourceError("");
      await loadSources();
    } catch (e) { setSourceError(String(e)); }
  }

  async function runSource(id: string) {
    setRunningId(id); setRunSuccess(null); setSourceError("");
    runStartRef.current = new Date().toISOString();
    setLogsOpen(true);
    if (logPollRef.current) clearInterval(logPollRef.current);
    logPollRef.current = setInterval(() => { void loadLogs(); }, 1000);
    try {
      const d = await apiFetch<{ processed: number }>("/run", {
        method: "POST", body: JSON.stringify({ sourceId: id }),
      });
      setRunSuccess({ id, count: d.processed });
      await loadSources();
    } catch (e) { setSourceError(String(e)); }
    finally {
      setRunningId(null);
      if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
      void loadLogs();
    }
  }

  async function applyDefaultsToAll() {
    setApplyingDefs(true); setDefsApplied(false);
    const active = sources.filter((s) => s.active);
    for (const src of active) {
      await apiFetch(`/sources/${src.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          autoMode: defAutoMode, scheduleHours: defSchedule,
          fetchLimit: defFetchLimit, giveCredit: defCredit,
        }),
      });
    }
    await loadSources();
    setApplyingDefs(false); setDefsApplied(true);
    setTimeout(() => setDefsApplied(false), 3000);
  }

  async function runAllActive() {
    const active = sources.filter((s) => s.active);
    if (!active.length) return;
    setRunningAll(true); setRunSuccess(null); setSourceError("");
    runStartRef.current = new Date().toISOString();
    setLogsOpen(true);
    if (logPollRef.current) clearInterval(logPollRef.current);
    logPollRef.current = setInterval(() => { void loadLogs(); }, 1000);
    let total = 0;
    for (const src of active) {
      setRunningId(src.id);
      try {
        const d = await apiFetch<{ processed: number }>("/run", {
          method: "POST", body: JSON.stringify({ sourceId: src.id }),
        });
        total += d.processed;
      } catch { /* continue with next */ }
    }
    setRunningId(null); setRunningAll(false);
    setRunSuccess({ id: "all", count: total });
    if (logPollRef.current) { clearInterval(logPollRef.current); logPollRef.current = null; }
    void loadLogs();
    void loadSources();
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

  // ─── Queue processing ────────────────────────────────────────────────────────

  async function processQueue() {
    const delayMs = queueDelay * 1000;
    setQueueRunning(true);
    cancelQueueRef.current = false;

    // Snapshot at start to get stable indices + data
    const snapshot = articles
      .map((a, i) => ({ ...a, _idx: i }))
      .filter((a) => a.selectedForQueue && !a.imported && a.queueStatus !== "done" && a.queueStatus !== "skipped");

    for (let qi = 0; qi < snapshot.length; qi++) {
      if (cancelQueueRef.current) break;
      const item = snapshot[qi]!;
      const idx  = item._idx;
      const src  = sources.find((s) => s.id === item.sourceId);

      // Step 1: Rewrite
      updateArticle(idx, { queueStatus: "rewriting", error: undefined });
      let rewrote: { content: string; keywords: string; slug: string } | null = null;

      try {
        const d = await apiFetch<{ rewritten: string; keywords?: string; slug?: string }>("/rewrite", {
          method: "POST",
          body: JSON.stringify({
            title:      item.title,
            text:       item.fullText || item.excerpt,
            sourceName: item.sourceName,
            giveCredit: src?.giveCredit !== false,
          }),
        });
        rewrote = { content: d.rewritten, keywords: d.keywords ?? "", slug: d.slug ?? "" };
        updateArticle(idx, {
          rewritten:    rewrote.content,
          editContent:  rewrote.content,
          aiKeywords:   rewrote.keywords,
          aiSlug:       rewrote.slug,
          queueStatus:  "publishing",
        });
      } catch (err) {
        updateArticle(idx, { queueStatus: "error", error: String(err) });
        if (qi < snapshot.length - 1 && !cancelQueueRef.current) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        continue;
      }

      // Step 2: Publish
      try {
        await apiFetch("/import", {
          method: "POST",
          body: JSON.stringify({
            title:         item.editTitle ?? item.title,
            subtitle:      item.editSubtitle ?? item.excerpt.slice(0, 160),
            content:       rewrote.content,
            category:      item.category,
            tag:           TAG_MAP[item.category] ?? "GERAL",
            imageUrl:      item.imageUrl,
            author:        src?.giveCredit !== false
                             ? `Redação (via ${item.sourceName})`
                             : "Redação",
            status:        "published",
            rssSourceId:   item.sourceId,
            rssSourceName: item.sourceName,
            rssSourceUrl:  item.link,
            aiRewritten:   true,
            keywords:      rewrote.keywords || undefined,
            slug:          rewrote.slug || undefined,
          }),
        });
        updateArticle(idx, { queueStatus: "done", imported: true });
      } catch (err) {
        const msg    = String(err);
        const isDupe = msg.includes("duplicado") || msg.includes("409");
        updateArticle(idx, {
          queueStatus: isDupe ? "skipped" : "error",
          imported:    isDupe,
          error:       isDupe ? "⚠ Já importado anteriormente" : msg,
        });
      }

      // Delay between requests (respects free-tier rate limits)
      if (qi < snapshot.length - 1 && !cancelQueueRef.current) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    setQueueRunning(false);
    void loadRssStats();
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
  const ITEMS_PER_PAGE = 7;
  const needsKey = aiSettings.provider !== "gemini_free";

  // ── Queue derived stats ──
  const queueStats = useMemo(() => {
    const selectable = articles.filter((a) => !a.imported && a.queueStatus !== "done" && a.queueStatus !== "skipped");
    const selected   = selectable.filter((a) => a.selectedForQueue);
    const done       = articles.filter((a) => a.queueStatus === "done").length;
    const errors     = articles.filter((a) => a.queueStatus === "error").length;
    const skipped    = articles.filter((a) => a.queueStatus === "skipped").length;
    const active     = articles.find(
      (a) => a.queueStatus === "rewriting" || a.queueStatus === "publishing"
    );
    const allSelected = selectable.length > 0 && selected.length === selectable.length;
    return { selectable: selectable.length, selected: selected.length, done, errors, skipped, active, allSelected };
  }, [articles]);

  function toggleSelectAll() {
    const allSelected = queueStats.allSelected;
    setArticles((prev) => prev.map((a) =>
      !a.imported && a.queueStatus !== "done" && a.queueStatus !== "skipped"
        ? { ...a, selectedForQueue: !allSelected }
        : a
    ));
  }

  // ── Filtered / paginated sources ─────────────────────────────────────────────
  const filteredSources = useMemo(() => {
    const q = sourceSearch.toLowerCase();
    let list = q
      ? sources.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q) ||
          (TAG_MAP[s.category] ?? s.category).toLowerCase().includes(q)
        )
      : [...sources];
    if (statusFilter === "Ativo")   list = list.filter((s) => s.active);
    if (statusFilter === "Pausado") list = list.filter((s) => !s.active);
    return list;
  }, [sources, sourceSearch, statusFilter]);

  const totalPages   = Math.max(1, Math.ceil(filteredSources.length / ITEMS_PER_PAGE));
  const pagedSources = filteredSources.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  function srcInitials(name: string): string {
    const words = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, "").trim().split(/\s+/);
    if (words.length === 0) return "?";
    if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }

  const SRC_PALETTE = ["#E71D36","#0B2A66","#2563EB","#16A34A","#F97316","#9333EA","#0EA5E9","#DC2626"];
  function srcColor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
    return SRC_PALETTE[Math.abs(h) % SRC_PALETTE.length] ?? "#0B2A66";
  }

  function fmtFetch(ts?: string): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <AdminLayout title="Fontes RSS">

        {/* ══ STAT CARDS ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
          {([
            {
              label: "Fontes ativas",
              value: sources.filter((s) => s.active).length,
              sub:   `${sources.length} total cadastradas`,
              icon:  Rss,
              ib: "#DCFCE7", ic: "#16A34A",
            },
            {
              label: "Total importados",
              value: rssStats.total,
              sub:   "artigos via RSS",
              icon:  RefreshCw,
              ib: "#FFF7ED", ic: "#F97316",
            },
            {
              label: "Reescritos com IA",
              value: rssStats.rewritten,
              sub:   rssStats.total > 0
                       ? `${Math.round((rssStats.rewritten / rssStats.total) * 100)}% do total`
                       : "0%",
              icon:  Wand2,
              ib: "#F3E8FF", ic: "#9333EA",
            },
            {
              label: "Fontes pausadas",
              value: sources.filter((s) => !s.active).length,
              sub:   "inativas no momento",
              icon:  AlertCircle,
              ib: "#FEF2F2", ic: "#EF4444",
            },
          ] as const).map(({ label, value, sub, icon: Icon, ib, ic }) => (
            <div key={label} className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: ib }}>
                  <Icon size={20} style={{ color: ic }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ══ 2-COLUMN GRID ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">

          {/* ── LEFT: sources table ───────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>

            {/* Filters row */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={sourceSearch}
                  onChange={(e) => { setSourceSearch(e.target.value); setCurrentPage(1); }}
                  placeholder="Buscar fontes..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
                />
                {sourceSearch && (
                  <button onClick={() => setSourceSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="pl-4 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700 min-w-[130px]"
                >
                  {["Todos", "Ativo", "Pausado"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={() => { void runAllActive(); }}
                disabled={runningAll || runningId !== null || sources.filter((s) => s.active).length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {runningAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {runningAll ? "Coletando…" : "Coletar todos"}
              </button>
            </div>

            {/* Feedback banners */}
            {sourceError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 mb-4">
                <AlertCircle size={14} className="shrink-0" />
                <span className="flex-1">{sourceError}</span>
                <button onClick={() => setSourceError("")} className="text-red-400 hover:text-red-600 ml-2"><X size={13} /></button>
              </div>
            )}
            {runSuccess && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700 mb-4">
                <CheckCircle size={14} className="shrink-0" />
                <span className="flex-1">✅ {runSuccess.count} artigo(s) processado(s)</span>
                <button onClick={() => setRunSuccess(null)} className="text-green-400 hover:text-green-600 ml-2"><X size={13} /></button>
              </div>
            )}

            {/* Table */}
            {sources.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Rss size={28} className="text-slate-300" />
                </div>
                <p className="text-sm text-slate-500 font-medium">Nenhuma fonte cadastrada</p>
                <p className="text-xs text-slate-400 mt-1">Use o painel à direita para adicionar a primeira fonte RSS</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {["Fonte", "Categoria", "Última coleta", "Status", "Modo", "Ações"].map((h) => (
                          <th key={h} className="pb-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide pr-4 last:pr-0">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pagedSources.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                            Nenhuma fonte encontrada
                          </td>
                        </tr>
                      ) : pagedSources.map((src) => {
                        if (editingSource?.id === src.id) {
                          return (
                            <tr key={src.id}>
                              <td colSpan={6} className="py-4">
                                <div className="bg-[#EEF2FF] rounded-xl p-4 border border-[#C7D2FE] space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Nome</label>
                                      <input value={editingSource.name}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, name: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white"/>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Categoria</label>
                                      <select value={editingSource.category}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, category: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white appearance-none">
                                        {allCategories.map(({ slug, label }) => <option key={slug} value={slug}>{label}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">URL do Feed</label>
                                      <input value={editingSource.url}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, url: e.target.value }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white"/>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Agendamento</label>
                                      <select value={editingSource.scheduleHours}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, scheduleHours: Number(e.target.value) }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white appearance-none">
                                        {SCHEDULE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Modo</label>
                                      <select value={editingSource.autoMode}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, autoMode: e.target.value as AutoMode }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white appearance-none">
                                        {AUTO_MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Notícias/coleta</label>
                                      <select value={editingSource.fetchLimit ?? 3}
                                        onChange={(e) => setEditingSource((s) => s && ({ ...s, fetchLimit: Number(e.target.value) }))}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-[#0B2A66] bg-white appearance-none">
                                        {FETCH_LIMIT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Crédito</label>
                                      <label className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 text-xs cursor-pointer bg-white">
                                        <input type="checkbox" checked={editingSource.giveCredit}
                                          onChange={(e) => setEditingSource((s) => s && ({ ...s, giveCredit: e.target.checked }))}/>
                                        Dar crédito
                                      </label>
                                    </div>
                                  </div>
                                  <details className="group">
                                    <summary className="cursor-pointer flex items-center gap-2 text-xs font-semibold text-purple-600 py-1 select-none list-none">
                                      <Wand2 size={12}/>Prompt personalizado
                                      {editingSource.customPrompt && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"/>}
                                      <ChevronDown size={12} className="ml-auto group-open:hidden"/>
                                      <ChevronUp size={12} className="ml-auto hidden group-open:block"/>
                                    </summary>
                                    <div className="pt-2">
                                      <PromptEditor
                                        value={editingSource.customPrompt}
                                        onChange={(v) => setEditingSource((s) => s && ({ ...s, customPrompt: v }))}
                                        apiFetch={apiFetch}
                                      />
                                    </div>
                                  </details>
                                  <div className="flex gap-2">
                                    <button onClick={() => { void saveEdit(); }}
                                      className="bg-[#0B2A66] text-white px-4 py-1.5 rounded-xl text-xs font-semibold hover:bg-[#0B2A66]/90 transition-colors">
                                      Salvar
                                    </button>
                                    <button onClick={() => setEditingSource(null)}
                                      className="bg-slate-100 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors">
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        const color    = srcColor(src.id);
                        const initials = srcInitials(src.name);
                        const catLabel = (TAG_MAP[src.category] ?? src.category);

                        return (
                          <tr key={src.id} className="hover:bg-slate-50/60 transition-colors group">
                            {/* Fonte */}
                            <td className="py-3.5 pr-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: color }}>
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate max-w-[160px]">{src.name}</p>
                                  <a href={src.url} target="_blank" rel="noreferrer"
                                    className="text-[11px] text-[#2563EB] hover:underline truncate block max-w-[160px]"
                                    title={src.url}>
                                    {src.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26)}{src.url.length > 33 ? "…" : ""}
                                  </a>
                                </div>
                              </div>
                            </td>
                            {/* Categoria */}
                            <td className="py-3.5 pr-4">
                              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{catLabel}</span>
                            </td>
                            {/* Última coleta */}
                            <td className="py-3.5 pr-4">
                              <span className="text-xs text-slate-500 whitespace-nowrap">{fmtFetch(src.lastFetchedAt)}</span>
                            </td>
                            {/* Status */}
                            <td className="py-3.5 pr-4">
                              <button
                                onClick={() => { void toggleSource(src); }}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                                  src.active
                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                    : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                }`}
                              >
                                {src.active ? "● Ativo" : "○ Pausado"}
                              </button>
                            </td>
                            {/* Modo */}
                            <td className="py-3.5 pr-4">
                              <AutoModeBadge mode={src.autoMode} />
                            </td>
                            {/* Ações */}
                            <td className="py-3.5">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => { void runSource(src.id); }}
                                  disabled={runningId === src.id}
                                  title="Coletar agora"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40"
                                >
                                  {runningId === src.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                </button>
                                <button
                                  onClick={() => setEditingSource({ ...src })}
                                  title="Editar"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-[#EEF2FF] transition-colors"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => { void deleteSource(src.id); }}
                                  title="Remover"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredSources.length)} de {filteredSources.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        <ChevronDown size={13} className="-rotate-90" />
                      </button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                            currentPage === page
                              ? "bg-[#0B2A66] text-white"
                              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      {totalPages > 5 && <span className="text-slate-400 text-xs px-1">…</span>}
                      {totalPages > 5 && (
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                            currentPage === totalPages
                              ? "bg-[#0B2A66] text-white"
                              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {totalPages}
                        </button>
                      )}
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        <ChevronDown size={13} className="rotate-90" />
                      </button>
                    </div>
                  </div>
                )}
                {totalPages <= 1 && filteredSources.length > 0 && (
                  <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100">
                    {filteredSources.length} fonte{filteredSources.length !== 1 ? "s" : ""}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── RIGHT: add form + advanced ────────────────────────────────── */}
          <div className="space-y-4">

            {/* Add source form */}
            <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-[#0B2A66]">Adicionar nova fonte RSS</h3>
                <p className="text-xs text-slate-500 mt-0.5">Informe os dados da fonte para começar a importar.</p>
              </div>
              <form onSubmit={(e) => { void addSource(e); }} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Nome da fonte <span className="text-[#E71D36]">*</span>
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex.: G1 – São Paulo"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    URL do feed <span className="text-[#E71D36]">*</span>
                  </label>
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://site.com.br/feed.xml"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Categoria <span className="text-[#E71D36]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                    >
                      {allCategories.map(({ slug, label }) => (
                        <option key={slug} value={slug}>{label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {/* Advanced options */}
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-2 text-xs font-semibold text-slate-500 py-1 select-none list-none">
                    <Settings size={12} className="text-slate-400"/>
                    Opções avançadas
                    <ChevronDown size={12} className="ml-auto group-open:hidden"/>
                    <ChevronUp size={12} className="ml-auto hidden group-open:block"/>
                  </summary>
                  <div className="pt-3 space-y-3">
                    <div className="relative">
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Agendamento</label>
                      <select value={newSchedule} onChange={(e) => setNewSchedule(Number(e.target.value))}
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none">
                        {SCHEDULE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 bottom-3 text-slate-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Automação</label>
                      <select value={newAutoMode} onChange={(e) => setNewAutoMode(e.target.value as AutoMode)}
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none">
                        {AUTO_MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 bottom-3 text-slate-400 pointer-events-none" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={newCredit} onChange={(e) => setNewCredit(e.target.checked)} className="rounded"/>
                      <BadgeCheck size={14} className="text-[#0B2A66]"/> Dar crédito à fonte
                    </label>
                  </div>
                </details>

                {addError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/>{addError}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button"
                    onClick={() => { setNewName(""); setNewUrl(""); }}
                    className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={adding}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-60 transition-colors"
                    style={{ background: "#E71D36" }}>
                    {adding ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                    {adding ? "Salvando…" : "Salvar fonte"}
                  </button>
                </div>
              </form>

              {/* Dica */}
              <div className="mt-4 flex items-start gap-2.5 bg-blue-50 rounded-xl p-3.5">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle size={11} className="text-[#2563EB]" />
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  <span className="font-semibold">Dica:</span> Certifique-se de que a URL do feed RSS está correta e é pública.
                </p>
              </div>
            </div>

            {/* ── AI Settings collapsible ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
              <button type="button" onClick={() => setPromptsOpen((v) => !v)}
                className="w-full flex items-center gap-3 p-5 hover:bg-slate-50 transition-colors text-left">
                <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                  <Brain size={15} className="text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0B2A66]">Configurações de IA</p>
                  <p className="text-xs text-slate-500 truncate">{AI_PROVIDERS.find((p) => p.value === aiSettings.provider)?.label ?? "—"}</p>
                </div>
                {promptsOpen ? <ChevronUp size={14} className="text-slate-400 shrink-0"/> : <ChevronDown size={14} className="text-slate-400 shrink-0"/>}
              </button>

              {promptsOpen && (
                <div className="border-t border-slate-100 p-5 space-y-4">
                  <form onSubmit={(e) => { void saveAiSettings(e); }} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">Provedor de IA</label>
                      <div className="space-y-2">
                        {AI_PROVIDERS.map((p) => (
                          <button key={p.value} type="button"
                            onClick={() => setAiSettings((a) => ({ ...a, provider: p.value, model: "" }))}
                            className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                              aiSettings.provider === p.value
                                ? "border-purple-400 bg-purple-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <span className="text-xs font-semibold text-slate-800">{p.label}</span>
                            <span className="text-[10px] text-slate-400">{p.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Modelo</label>
                      <div className="relative">
                        <select value={aiSettings.model}
                          onChange={(e) => setAiSettings((a) => ({ ...a, model: e.target.value }))}
                          className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none">
                          <option value="">Padrão (recomendado)</option>
                          {(aiSettings.provider === "openai" ? OPENAI_MODELS : GEMINI_MODELS).map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    {needsKey && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                          API Key {aiSettings.hasKey && <span className="text-green-600 ml-1">✓ configurada</span>}
                        </label>
                        <div className="relative">
                          <Key size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type={showApiKey ? "text" : "password"}
                            value={aiApiKey}
                            onChange={(e) => setAiApiKey(e.target.value)}
                            placeholder={aiSettings.hasKey ? "••••• (manter atual)" : "Insira sua API Key"}
                            className="w-full pl-8 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50"
                          />
                          <button type="button" onClick={() => setShowApiKey((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            {showApiKey ? <EyeOff size={13}/> : <Eye size={13}/>}
                          </button>
                        </div>
                        {aiSettings.provider === "gemini_paid" && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Chave gratuita em{" "}
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                              className="text-purple-600 underline hover:text-purple-700">
                              aistudio.google.com/apikey
                            </a>
                            {" "}— tier gratuito: 15 req/min, 1.500 req/dia
                          </p>
                        )}
                      </div>
                    )}
                    {aiError && <p className="text-xs text-red-500">{aiError}</p>}
                    <button type="submit" disabled={aiSaving}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                        aiSaved ? "bg-green-500 text-white" : "bg-purple-600 text-white hover:bg-purple-700"
                      }`}>
                      {aiSaved ? "✓ Salvo!" : aiSaving ? "Salvando…" : "Salvar Configuração de IA"}
                    </button>
                  </form>

                  {/* Quota indicator */}
                  {aiQuota && (
                    <div className={`rounded-xl p-3.5 border text-xs ${
                      aiQuota.isOnCooldown
                        ? "bg-red-50 border-red-200"
                        : aiQuota.isQuotaExhausted
                          ? "bg-orange-50 border-orange-200"
                          : aiQuota.remaining <= 3
                            ? "bg-amber-50 border-amber-200"
                            : "bg-slate-50 border-slate-200"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            aiQuota.isOnCooldown || aiQuota.isQuotaExhausted ? "bg-red-500" :
                            aiQuota.remaining <= 3 ? "bg-amber-500" : "bg-green-500"
                          }`}/>
                          Quota de IA hoje
                        </span>
                        <span className={`font-bold ${
                          aiQuota.isQuotaExhausted || aiQuota.isOnCooldown ? "text-red-600" :
                          aiQuota.remaining <= 3 ? "text-amber-600" : "text-slate-600"
                        }`}>
                          {aiQuota.usedToday} / {aiQuota.dailyLimit}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            aiQuota.isQuotaExhausted || aiQuota.isOnCooldown ? "bg-red-500" :
                            aiQuota.remaining <= 3 ? "bg-amber-500" : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(100, (aiQuota.usedToday / aiQuota.dailyLimit) * 100)}%` }}
                        />
                      </div>
                      {aiQuota.isOnCooldown ? (
                        <p className="text-red-600 font-medium">
                          ⏳ Aguardando {Math.ceil(aiQuota.cooldownRemainingMs / 1_000)}s — limite temporário da API
                        </p>
                      ) : aiQuota.isQuotaExhausted ? (
                        <p className="text-orange-700 font-medium">
                          🚫 Limite diário atingido. Reinicia à meia-noite (UTC).
                        </p>
                      ) : (
                        <p className="text-slate-500">
                          {aiQuota.remaining} requisição{aiQuota.remaining !== 1 ? "ões" : ""} restante{aiQuota.remaining !== 1 ? "s" : ""} hoje · reseta à meia-noite
                        </p>
                      )}
                    </div>
                  )}

                  {/* Prompts */}
                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Wand2 size={12} className="text-purple-500"/>Prompts de Reescrita
                      </p>
                      <span className="text-[10px] text-slate-400">fonte &gt; categoria &gt; geral</span>
                    </div>
                    <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2 mb-3">
                      {[{ slug: "__global__", label: "🌐 Geral" } as { slug: string; label: string }, ...allCategories].map(({ slug, label }) => {
                        const hasCustom = slug === "__global__" ? !!prompts.global : !!prompts.categories?.[slug];
                        return (
                          <button key={slug} type="button" onClick={() => setPromptTab(slug)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border-b-2 transition-colors ${
                              promptTab === slug
                                ? "border-purple-600 text-purple-700 bg-purple-50"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {label}
                            {hasCustom && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"/>}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      key={promptTab}
                      value={promptCurrentVal}
                      onChange={(e) => setTabPrompt(promptTab, e.target.value)}
                      rows={7}
                      placeholder={`Prompt para ${promptTabLabel}. Deixe vazio para usar o padrão.`}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono outline-none focus:border-[#0B2A66] resize-y bg-slate-50"
                      spellCheck={false}
                    />
                    <div className="flex items-center gap-3 mt-2">
                      <button type="button" onClick={() => { void loadDefaultPromptInto(promptTab); }}
                        disabled={promptDefaultLoading}
                        className="text-[11px] text-[#2563EB] hover:underline disabled:opacity-50">
                        {promptDefaultLoading ? "Carregando…" : "Carregar padrão"}
                      </button>
                      {promptHasValue && (
                        <button type="button" onClick={() => clearTabPrompt(promptTab)}
                          className="text-[11px] text-red-400 hover:underline">
                          Limpar
                        </button>
                      )}
                      <button type="button" onClick={() => { void savePrompts(); }}
                        disabled={promptSaving}
                        className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 ${
                          promptSaved ? "bg-green-500 text-white" : "bg-purple-600 text-white hover:bg-purple-700"
                        }`}>
                        {promptSaved ? "✓ Salvo!" : promptSaving ? "Salvando…" : "Salvar Prompts"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Global defaults + Manual fetch + Logs collapsible ───────── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
              <button type="button" onClick={() => { setLogsOpen((v) => !v); if (!logsOpen) void loadLogs(); }}
                className="w-full flex items-center gap-3 p-5 hover:bg-slate-50 transition-colors text-left">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                  <Zap size={15} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0B2A66]">Configurações Globais</p>
                  <p className="text-xs text-slate-500">{sources.filter((s) => s.active).length} fontes ativas</p>
                </div>
                {logsOpen ? <ChevronUp size={14} className="text-slate-400 shrink-0"/> : <ChevronDown size={14} className="text-slate-400 shrink-0"/>}
              </button>

              {logsOpen && (
                <div className="border-t border-slate-100 p-5 space-y-4">
                  {/* Global defaults */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600">Padrões para fontes ativas</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Modo de reescrita</label>
                        <div className="relative">
                          <select value={defAutoMode} onChange={(e) => setDefAutoMode(e.target.value as AutoMode)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 outline-none focus:border-[#0B2A66] appearance-none">
                            {AUTO_MODE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Agendamento</label>
                        <div className="relative">
                          <select value={defSchedule} onChange={(e) => setDefSchedule(Number(e.target.value))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 outline-none focus:border-[#0B2A66] appearance-none">
                            {SCHEDULE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Notícias/coleta</label>
                        <div className="relative">
                          <select value={defFetchLimit} onChange={(e) => setDefFetchLimit(Number(e.target.value))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 outline-none focus:border-[#0B2A66] appearance-none">
                            {FETCH_LIMIT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={defCredit} onChange={(e) => setDefCredit(e.target.checked)} className="rounded"/>
                          Dar crédito à fonte (padrão)
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => { void applyDefaultsToAll(); }}
                        disabled={applyingDefs || sources.filter((s) => s.active).length === 0}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                          defsApplied ? "bg-green-500 text-white" : "bg-[#0B2A66] text-white hover:bg-[#0B2A66]/90"
                        }`}>
                        {defsApplied
                          ? <><CheckCircle size={12}/>Aplicado!</>
                          : applyingDefs
                            ? <><Loader2 size={12} className="animate-spin"/>Aplicando…</>
                            : <><Settings size={12}/>Aplicar a todos os feeds ativos</>}
                      </button>
                    </div>
                  </div>

                  {/* Manual fetch */}
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <RefreshCw size={12} className="text-[#0B2A66]"/>Pré-visualizar artigos
                    </p>
                    <div className="relative mb-2">
                      <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 outline-none focus:border-[#0B2A66] appearance-none">
                        <option value="all">Todas as fontes ativas</option>
                        {sources.filter((s) => s.active).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    <button onClick={() => { void fetchArticles(); }}
                      disabled={fetching || sources.filter((s) => s.active).length === 0}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      style={{ background: "#E71D36" }}>
                      <RefreshCw size={14} className={fetching ? "animate-spin" : ""}/>
                      {fetching ? "Buscando artigos…" : "Buscar Agora"}
                    </button>
                    {fetchError && (
                      <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11}/>{fetchError}</p>
                    )}
                  </div>

                  {/* Logs */}
                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <BookOpen size={12} className="text-[#0B2A66]"/>Log de Coleta
                        {logs.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{logs.length}</span>
                        )}
                        {runningId !== null && <Loader2 size={10} className="animate-spin text-amber-500"/>}
                      </p>
                      <button type="button" onClick={() => { void loadLogs(); }}
                        className="flex items-center gap-1 text-[11px] text-[#0B2A66] hover:underline">
                        <RefreshCw size={10}/> Atualizar
                      </button>
                    </div>
                    {logs.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Execute uma coleta para ver os logs.</p>
                    ) : (
                      <div className="space-y-1 max-h-[220px] overflow-y-auto">
                        {logs.slice(0, 30).map((entry) => {
                          const icons: Record<RssLogEntry["type"], string> = {
                            fetch:"🔍",rewrite:"✨",publish:"📢",draft:"📝",skip:"⏭",error:"❌",duplicate:"♻",
                          };
                          const clrs: Record<RssLogEntry["type"], string> = {
                            fetch:"text-blue-600",rewrite:"text-purple-600",publish:"text-green-600",
                            draft:"text-amber-600",skip:"text-slate-400",error:"text-red-600",duplicate:"text-slate-400",
                          };
                          return (
                            <div key={entry.id} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
                              <span className="text-sm shrink-0">{icons[entry.type]}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-bold uppercase ${clrs[entry.type]}`}>{entry.type}</span>
                                  <span className="text-[10px] text-slate-400 ml-auto shrink-0">{new Date(entry.ts).toLocaleTimeString("pt-BR")}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate">{entry.articleTitle ?? entry.sourceName}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ ARTICLE PREVIEW + QUEUE (full width) ═════════════════════════ */}
        {articles.length > 0 && (
          <div className="mt-5 space-y-3">

            {/* Queue control bar */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <ListChecks size={16} className="text-purple-600 shrink-0"/>
                <span className="font-semibold text-sm text-[#0B2A66]">Fila de Reescrita e Publicação</span>
                <span className="ml-auto text-xs text-slate-400">{articles.length} artigo(s) coletado(s)</span>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={toggleSelectAll} disabled={queueRunning}
                    className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#0B2A66] disabled:opacity-40 transition-colors">
                    {queueStats.allSelected
                      ? <CheckSquare size={17} className="text-purple-600"/>
                      : <Square size={17} className="text-slate-400"/>}
                    {queueStats.allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                  <span className="text-xs text-slate-400">{queueStats.selected} de {queueStats.selectable} selecionados</span>
                  <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    <Timer size={13} className="text-amber-500"/>
                    Intervalo:
                    <input type="number" min={1} max={60} value={queueDelay}
                      onChange={(e) => setQueueDelay(Math.max(1, Number(e.target.value)))}
                      disabled={queueRunning}
                      className="w-14 border border-slate-200 rounded-xl px-2 py-1 text-center text-xs outline-none focus:border-[#0B2A66] disabled:opacity-40"/>
                    seg
                    {aiSettings.provider === "gemini_free" && (
                      <span className="text-amber-600 font-semibold">(mín. 4s)</span>
                    )}
                  </div>
                </div>
                {(queueStats.done > 0 || queueStats.errors > 0 || queueStats.skipped > 0 || queueRunning) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle size={12}/>{queueStats.done} publicado(s)</span>
                      {queueStats.skipped > 0 && <span className="text-amber-500 font-semibold">⚠ {queueStats.skipped} duplicado(s)</span>}
                      {queueStats.errors > 0 && <span className="flex items-center gap-1 text-red-500 font-semibold"><AlertCircle size={12}/>{queueStats.errors} erro(s)</span>}
                      {queueStats.active && (
                        <span className="flex items-center gap-1 text-purple-600 font-semibold animate-pulse">
                          <Loader2 size={12} className="animate-spin"/>
                          {queueStats.active.queueStatus === "rewriting" ? "Reescrevendo…" : "Publicando…"}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const total = queueStats.done + queueStats.errors + queueStats.skipped +
                        articles.filter((a) => a.selectedForQueue && (a.queueStatus === "pending" || a.queueStatus === "rewriting" || a.queueStatus === "publishing")).length;
                      const pct = total > 0 ? Math.round(((queueStats.done + queueStats.errors + queueStats.skipped) / total) * 100) : 0;
                      return (
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {queueRunning ? (
                    <button onClick={() => { cancelQueueRef.current = true; }}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
                      <StopCircle size={15}/> Pausar fila
                    </button>
                  ) : (
                    <button onClick={() => { void processQueue(); }}
                      disabled={queueStats.selected === 0}
                      className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-colors">
                      <Wand2 size={15}/>
                      Processar fila — Reescrever e Publicar com IA ({queueStats.selected})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Article cards */}
            {articles.map((art, idx) => {
              const qs        = art.queueStatus;
              const isDone    = qs === "done";
              const isSkipped = qs === "skipped";
              const isError   = qs === "error";
              const isActive  = qs === "rewriting" || qs === "publishing";
              const isQueued  = !!art.selectedForQueue;

              return (
                <div key={`${art.sourceId}-${idx}`}
                  className={`bg-white rounded-2xl overflow-hidden transition-all ${
                    isDone || isSkipped ? "opacity-50" : ""
                  } ${isQueued && !isDone && !isSkipped ? "ring-1 ring-purple-200" : ""} ${
                    isActive ? "ring-2 ring-purple-400" : ""
                  }`}
                  style={{ boxShadow: CARD_SHADOW }}>

                  <div className="flex gap-3 p-4 items-start">
                    <button
                      onClick={() => { if (!queueRunning && !isDone && !isSkipped) updateArticle(idx, { selectedForQueue: !art.selectedForQueue }); }}
                      disabled={queueRunning || isDone || isSkipped}
                      className="mt-0.5 shrink-0 disabled:cursor-default">
                      {isDone
                        ? <CheckCircle size={18} className="text-green-500"/>
                        : isSkipped ? <span className="text-amber-400 text-base">⚠</span>
                        : isError ? <AlertCircle size={18} className="text-red-400"/>
                        : isQueued ? <CheckSquare size={18} className="text-purple-600"/>
                        : <Square size={18} className="text-slate-300 hover:text-slate-400 transition-colors"/>}
                    </button>
                    {art.imageUrl ? (
                      <img src={art.imageUrl} alt=""
                        className="w-24 h-16 object-cover rounded-xl flex-shrink-0 bg-slate-100"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
                    ) : (
                      <div className="w-24 h-16 rounded-xl flex-shrink-0 bg-slate-100 flex items-center justify-center">
                        <Rss size={20} className="text-slate-300"/>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold text-[#E71D36] uppercase tracking-wide">{TAG_MAP[art.category] ?? art.category}</span>
                        <span className="text-xs text-slate-400">· {art.sourceName}</span>
                        {qs === "rewriting" && <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 animate-pulse"><Loader2 size={9} className="animate-spin"/>Reescrevendo…</span>}
                        {qs === "publishing" && <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse"><Loader2 size={9} className="animate-spin"/>Publicando…</span>}
                        {qs === "done" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Publicado</span>}
                        {qs === "skipped" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">⚠ Duplicado</span>}
                        {qs === "error" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">✗ Erro</span>}
                        {art.link && (
                          <a href={art.link} target="_blank" rel="noreferrer"
                            className="text-slate-300 hover:text-[#0B2A66] ml-auto transition-colors">
                            <ExternalLink size={13}/>
                          </a>
                        )}
                      </div>
                      <p className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">{art.title}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{art.excerpt}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 px-4 py-3">
                    <button onClick={() => updateArticle(idx, { expanded: !art.expanded })}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                      {art.expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                      {art.expanded ? "Recolher" : "Editar / Publicar manualmente"}
                    </button>
                    {art.expanded && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Título</label>
                          <input value={art.editTitle ?? art.title} onChange={(e) => updateArticle(idx, { editTitle: e.target.value })}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66]"/>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Subtítulo / Chapéu</label>
                          <input value={art.editSubtitle ?? ""} onChange={(e) => updateArticle(idx, { editSubtitle: e.target.value })}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66]"/>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Conteúdo
                            {art.rewritten && <span className="ml-2 text-purple-600 font-semibold">✦ Reescrito com IA</span>}
                          </label>
                          <textarea value={art.editContent ?? art.fullText} onChange={(e) => updateArticle(idx, { editContent: e.target.value })}
                            rows={10} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] font-mono leading-relaxed"/>
                        </div>
                        {art.rewritten && (art.aiKeywords || art.aiSlug) && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                            {art.aiSlug && <p className="text-xs font-mono text-purple-800">slug: {art.aiSlug}</p>}
                            {art.aiKeywords && <p className="text-xs text-purple-800">keywords: {art.aiKeywords}</p>}
                          </div>
                        )}
                      </div>
                    )}
                    {art.error && !isSkipped && (
                      <p className="mt-2 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/>{art.error}</p>
                    )}
                    {!isDone && !isSkipped && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {art.imported ? (
                          <span className="flex items-center gap-1 text-sm text-green-600 font-semibold"><CheckCircle size={16}/> Importado!</span>
                        ) : (
                          <>
                            <button onClick={() => { void rewrite(idx); }}
                              disabled={art.rewriting || art.importing || queueRunning}
                              className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                              <Wand2 size={13} className={art.rewriting ? "animate-pulse" : ""}/>
                              {art.rewriting ? "Reescrevendo…" : "Reescrever com IA"}
                            </button>
                            <button onClick={() => { void importArticle(idx, "draft"); }}
                              disabled={art.importing || art.rewriting || queueRunning}
                              className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-200 disabled:opacity-50 transition-colors">
                              <Send size={13}/>{art.importing ? "Salvando…" : "Rascunho"}
                            </button>
                            <button onClick={() => { void importArticle(idx, "published"); }}
                              disabled={art.importing || art.rewriting || queueRunning}
                              className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors"
                              style={{ background: "#E71D36" }}>
                              <Send size={13}/>{art.importing ? "Publicando…" : "Publicar"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </AdminLayout>
  );
}
