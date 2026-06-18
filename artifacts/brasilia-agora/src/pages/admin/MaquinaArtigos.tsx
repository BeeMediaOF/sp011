import { useState, useRef } from "react";
import { useCategories, categoryColor } from "../../hooks/useCategories";
import { useLocation } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { useToast } from "../../hooks/use-toast";
import {
  Bot, Link2, Youtube, Globe, Sparkles, RefreshCw,
  CheckCircle, AlertCircle, ClipboardPaste, ArrowRight,
  FileText, Image, Tag, Send, BookOpen, ChevronDown, ChevronUp,
  ExternalLink, Pencil, X, Settings, Key, Eye, EyeOff, Save,
  Cpu, MessageSquare, Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedArticle {
  title: string;
  subtitle: string;
  content: string;
  keywords: string;
  slug: string;
  imageUrl: string;
  category: string;
  sourceUrl: string;
  sourceName: string;
}

const STEPS = [
  { label: "Analisando a URL…",          icon: Link2 },
  { label: "Extraindo conteúdo…",        icon: Globe },
  { label: "Gerando artigo com IA…",     icon: Sparkles },
  { label: "Finalizando…",              icon: CheckCircle },
];

function detectSourceType(url: string): "youtube" | "news" | "web" | null {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/g1\.globo|folha\.uol|uol\.com|agenciasenado|agenciabrasil|correio|metropoles|r7\.com|record|band\.uol|cnn\.com|bbc\.com|nyt\.com|washingtonpost|theguardian/.test(url)) return "news";
  return "web";
}

const SOURCE_BADGE: Record<NonNullable<ReturnType<typeof detectSourceType>>, { label: string; color: string; Icon: typeof Youtube }> = {
  youtube: { label: "YouTube", color: "bg-red-100 text-red-700 border-red-200", Icon: Youtube },
  news:    { label: "Portal de Notícias", color: "bg-blue-100 text-blue-700 border-blue-200", Icon: FileText },
  web:     { label: "Site Web", color: "bg-gray-100 text-gray-700 border-gray-200", Icon: Globe },
};

// ─── History ─────────────────────────────────────────────────────────────────

const LS_KEY = "maquina_artigos_history";

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  category: string;
  ts: string;
}

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as HistoryEntry[]; } catch { return []; }
}
function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 20))); } catch {}
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── AI Settings panel ────────────────────────────────────────────────────────

interface AiSettings {
  provider: "gemini_free" | "gemini_paid" | "openai";
  model: string;
  hasKey: boolean;
  outputPrompt: string;
  hasDiffbotKey: boolean;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
  hasYoutubeKey: boolean;
}

const AI_PROVIDERS = [
  { value: "gemini_free",  label: "Gemini (grátis via Replit)", hint: "Sem necessidade de chave" },
  { value: "gemini_paid",  label: "Gemini (pago)",              hint: "Requer chave da Google AI" },
  { value: "openai",       label: "ChatGPT (OpenAI)",           hint: "Requer chave da OpenAI" },
] as const;

const DEFAULT_OUTPUT_PROMPT = `Você é um jornalista brasileiro experiente. Reescreva o conteúdo abaixo como um artigo jornalístico completo, profissional e original em português do Brasil.

Fonte: {sourceName}
Título original: {title}

Conteúdo:
{text}

INSTRUÇÕES:
- Escreva em português do Brasil, tom jornalístico
- Crie um título atraente e objetivo
- Escreva um subtítulo/lide que resuma o principal
- Desenvolva o conteúdo em parágrafos bem estruturados
- Não copie frases literais da fonte
{creditLine}

Responda APENAS em JSON válido com este formato:
{"title":"...","subtitle":"...","content":"<p>...</p><p>...</p>","keywords":"palavra1, palavra2, palavra3","slug":"slug-do-artigo"}`;

export default function MaquinaArtigos() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { categories } = useCategories();

  const [url, setUrl]               = useState("");
  const [category, setCategory]     = useState("geral");
  const [giveCredit, setGiveCredit] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [step, setStep]             = useState(-1);
  const [error, setError]           = useState("");

  const [result, setResult]         = useState<GeneratedArticle | null>(null);
  const [editTitle, setEditTitle]   = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [editContent, setEditContent]   = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editSlug, setEditSlug]         = useState("");
  const [showContent, setShowContent]   = useState(false);
  const [previewTab, setPreviewTab]     = useState<"preview" | "edit">("preview");

  const [saving, setSaving]         = useState(false);
  const [history, setHistory]       = useState<HistoryEntry[]>(loadHistory);

  // ── Settings state ──
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving]   = useState(false);
  const [aiSettings, setAiSettings]           = useState<AiSettings | null>(null);
  const [cfgProvider, setCfgProvider]         = useState<AiSettings["provider"]>("gemini_free");
  const [cfgModel, setCfgModel]               = useState("");
  const [cfgApiKey, setCfgApiKey]             = useState("");
  const [cfgDiffbotKey, setCfgDiffbotKey]     = useState("");
  const [cfgOutputPrompt, setCfgOutputPrompt] = useState("");
  const [cfgGeminiKey, setCfgGeminiKey]       = useState("");
  const [cfgOpenaiKey, setCfgOpenaiKey]       = useState("");
  const [cfgYoutubeKey, setCfgYoutubeKey]     = useState("");
  const [showApiKey, setShowApiKey]           = useState(false);
  const [showDiffbotKey, setShowDiffbotKey]   = useState(false);
  const [showGeminiKey, setShowGeminiKey]     = useState(false);
  const [showOpenaiKey, setShowOpenaiKey]     = useState(false);
  const [showYoutubeKey, setShowYoutubeKey]   = useState(false);

  const urlInputRef = useRef<HTMLInputElement>(null);

  const sourceType = detectSourceType(url);
  const sourceBadge = sourceType ? SOURCE_BADGE[sourceType] : null;

  async function loadAiSettings() {
    setSettingsLoading(true);
    try {
      const token = localStorage.getItem("admin_token") ?? "";
      const r = await fetch("/api/admin/rss/ai-settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      const d = await r.json() as AiSettings;
      setAiSettings(d);
      setCfgProvider(d.provider);
      setCfgModel(d.model);
      setCfgApiKey("");
      setCfgDiffbotKey("");
      setCfgGeminiKey("");
      setCfgOpenaiKey("");
      setCfgYoutubeKey("");
      setCfgOutputPrompt(d.outputPrompt || "");
    } catch {
      toast({ title: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveAiSettings() {
    setSettingsSaving(true);
    try {
      const token = localStorage.getItem("admin_token") ?? "";
      const body: Record<string, string> = { provider: cfgProvider, model: cfgModel };
      if (cfgApiKey)      body["apiKey"]       = cfgApiKey;
      if (cfgDiffbotKey)  body["diffbotApiKey"] = cfgDiffbotKey;
      if (cfgGeminiKey)   body["geminiApiKey"]  = cfgGeminiKey;
      if (cfgOpenaiKey)   body["openaiApiKey"]  = cfgOpenaiKey;
      if (cfgYoutubeKey)  body["youtubeApiKey"] = cfgYoutubeKey;
      body["outputPrompt"] = cfgOutputPrompt;
      const r = await fetch("/api/admin/rss/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      setCfgApiKey("");
      setCfgDiffbotKey("");
      setCfgGeminiKey("");
      setCfgOpenaiKey("");
      setCfgYoutubeKey("");
      setAiSettings(prev => prev ? {
        ...prev,
        provider: cfgProvider,
        model: cfgModel,
        hasKey: !!cfgApiKey || prev.hasKey,
        hasDiffbotKey: !!cfgDiffbotKey || prev.hasDiffbotKey,
        hasGeminiKey:  !!cfgGeminiKey  || prev.hasGeminiKey,
        hasOpenaiKey:  !!cfgOpenaiKey  || prev.hasOpenaiKey,
        hasYoutubeKey: !!cfgYoutubeKey || prev.hasYoutubeKey,
        outputPrompt: cfgOutputPrompt,
      } : prev);
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  }

  function toggleSettings() {
    if (!showSettings && !aiSettings) loadAiSettings();
    setShowSettings(v => !v);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith("http")) setUrl(text.trim());
    } catch {
      urlInputRef.current?.focus();
    }
  }

  async function generate() {
    if (!url.startsWith("http")) {
      setError("Cole uma URL válida (começando com http)");
      return;
    }
    setError("");
    setLoading(true);
    setStep(0);
    setResult(null);

    const token = localStorage.getItem("admin_token") ?? "";

    // Simulate step progression
    const stepTimer = setInterval(() => {
      setStep(s => (s < STEPS.length - 2 ? s + 1 : s));
    }, 1800);

    try {
      const r = await fetch("/api/admin/article-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), category, giveCredit }),
      });

      clearInterval(stepTimer);
      setStep(STEPS.length - 1);

      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Erro ao gerar artigo");
      }

      const data = await r.json() as GeneratedArticle;
      setResult(data);
      setEditTitle(data.title);
      setEditSubtitle(data.subtitle);
      setEditContent(data.content);
      setEditImageUrl(data.imageUrl);
      setEditKeywords(data.keywords);
      setEditSlug(data.slug);
      setShowContent(false);
      setPreviewTab("preview");

      // Save to local history
      const entry: HistoryEntry = {
        id: Math.random().toString(36).slice(2),
        url: url.trim(),
        title: data.title,
        category,
        ts: new Date().toISOString(),
      };
      const newHistory = [entry, ...history];
      setHistory(newHistory);
      saveHistory(newHistory);

      await new Promise(r => setTimeout(r, 600));
      setStep(-1);
    } catch (err: unknown) {
      clearInterval(stepTimer);
      setStep(-1);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      toast({ title: "Erro ao gerar artigo", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveArticle(status: "draft" | "published") {
    if (!result) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("admin_token") ?? "";
      const cat = categories.find(c => c.value === (result.category || category));
      const r = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:    editTitle,
          subtitle: editSubtitle,
          content:  editContent,
          category: result.category || category,
          tag:      cat?.tag ?? "GERAL",
          imageUrl: editImageUrl,
          keywords: editKeywords,
          slug:     editSlug,
          author:   "Redação",
          status,
          rssSourceName: result.sourceName,
          sourceUrl: result.sourceUrl,
        }),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
      const d = await r.json() as { article?: { id?: string } };
      toast({
        title: status === "published" ? "Artigo publicado!" : "Artigo salvo como rascunho!",
        description: editTitle.slice(0, 60),
      });
      if (d.article?.id) {
        navigate(`/admin/artigos/${d.article.id}`);
      }
    } catch (err) {
      toast({ title: "Erro ao salvar artigo", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function clearResult() {
    setResult(null);
    setStep(-1);
    setError("");
    setUrl("");
  }

  return (
    <AdminLayout title="Máquina de Artigos">
      <div className="max-w-4xl mx-auto space-y-6 pb-12">

        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0B2A66] to-[#1a4db8] flex items-center justify-center shrink-0 shadow-lg">
            <Bot size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Máquina de Artigos</h1>
              <button
                onClick={toggleSettings}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                  showSettings
                    ? "bg-[#0B2A66] text-white border-[#0B2A66]"
                    : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <Settings size={14} />
                Configurações
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Cole a URL de qualquer notícia, artigo ou vídeo do YouTube e gere um artigo completo com IA em segundos.
            </p>
          </div>
        </div>

        {/* ── Settings panel ── */}
        {showSettings && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Settings size={15} className="text-[#0B2A66] dark:text-blue-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Configurações de IA e Extração</span>
              </div>
              {settingsLoading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
            </div>

            <div className="p-6 space-y-6">

              {/* ── Diffbot section ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center">
                    <Zap size={14} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Diffbot</p>
                    <p className="text-[11px] text-slate-400">Extração avançada de artigos e transcrição de vídeos com IA</p>
                  </div>
                  {aiSettings?.hasDiffbotKey && (
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      ✓ Configurado
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Key size={11} /> API Token
                    {aiSettings?.hasDiffbotKey && <span className="text-green-600 dark:text-green-400 text-[10px]">· salvo (deixe em branco para manter)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showDiffbotKey ? "text" : "password"}
                      value={cfgDiffbotKey}
                      onChange={e => setCfgDiffbotKey(e.target.value)}
                      placeholder={aiSettings?.hasDiffbotKey ? "••••••••••••••••" : "Cole seu token Diffbot aqui"}
                      className="w-full pr-10 pl-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25 focus:border-[#0B2A66] font-mono transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDiffbotKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showDiffbotKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Com a chave configurada, a extração de artigos e a transcrição de vídeos do YouTube usam a API do Diffbot.
                    Sem ela, o sistema usa scraping próprio. <a href="https://www.diffbot.com" target="_blank" rel="noopener noreferrer" className="text-[#0B2A66] hover:underline">diffbot.com</a>
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700" />

              {/* ── Gemini API Key ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-blue-500">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">API Gemini</p>
                    <p className="text-[11px] text-slate-400">Google AI Studio — geração de artigos com Gemini</p>
                  </div>
                  {aiSettings?.hasGeminiKey && (
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      ✓ Configurado
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Key size={11} /> API Key
                    {aiSettings?.hasGeminiKey && <span className="text-green-600 dark:text-green-400 text-[10px]">· salvo (deixe em branco para manter)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={cfgGeminiKey}
                      onChange={e => setCfgGeminiKey(e.target.value)}
                      placeholder={aiSettings?.hasGeminiKey ? "••••••••••••••••" : "AIza..."}
                      className="w-full pr-10 pl-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 font-mono transition-colors"
                    />
                    <button type="button" onClick={() => setShowGeminiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showGeminiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Obtenha em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#0B2A66] hover:underline">aistudio.google.com</a>. Usado quando o provedor "Gemini (pago)" está selecionado.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700" />

              {/* ── ChatGPT (OpenAI) API Key ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-emerald-600">
                      <path d="M20.5 11c0-5.247-4.253-9.5-9.5-9.5S1.5 5.753 1.5 11c0 4.48 3.097 8.23 7.282 9.223l-.282.277H7v1.5h10v-1.5h-1.5l-.282-.277C19.403 19.23 22.5 15.48 22.5 11h-2z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">API ChatGPT</p>
                    <p className="text-[11px] text-slate-400">OpenAI — GPT-4o, GPT-4o-mini e demais modelos</p>
                  </div>
                  {aiSettings?.hasOpenaiKey && (
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      ✓ Configurado
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Key size={11} /> API Key
                    {aiSettings?.hasOpenaiKey && <span className="text-green-600 dark:text-green-400 text-[10px]">· salvo (deixe em branco para manter)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showOpenaiKey ? "text" : "password"}
                      value={cfgOpenaiKey}
                      onChange={e => setCfgOpenaiKey(e.target.value)}
                      placeholder={aiSettings?.hasOpenaiKey ? "••••••••••••••••" : "sk-..."}
                      className="w-full pr-10 pl-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 font-mono transition-colors"
                    />
                    <button type="button" onClick={() => setShowOpenaiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showOpenaiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Obtenha em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[#0B2A66] hover:underline">platform.openai.com</a>. Usado quando o provedor "ChatGPT (OpenAI)" está selecionado.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700" />

              {/* ── YouTube API Key ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-red-500">
                      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">API YouTube</p>
                    <p className="text-[11px] text-slate-400">YouTube Data API v3 — transcrição e metadados de vídeos</p>
                  </div>
                  {aiSettings?.hasYoutubeKey && (
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      ✓ Configurado
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Key size={11} /> API Key
                    {aiSettings?.hasYoutubeKey && <span className="text-green-600 dark:text-green-400 text-[10px]">· salvo (deixe em branco para manter)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showYoutubeKey ? "text" : "password"}
                      value={cfgYoutubeKey}
                      onChange={e => setCfgYoutubeKey(e.target.value)}
                      placeholder={aiSettings?.hasYoutubeKey ? "••••••••••••••••" : "AIza..."}
                      className="w-full pr-10 pl-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/25 focus:border-red-500 font-mono transition-colors"
                    />
                    <button type="button" onClick={() => setShowYoutubeKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showYoutubeKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Obtenha em <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-[#0B2A66] hover:underline">Google Cloud Console</a>. Permite buscar títulos, descrições e legendas de vídeos do YouTube.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700" />

              {/* ── AI provider section ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                    <Cpu size={14} className="text-[#0B2A66] dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Modelo de IA</p>
                    <p className="text-[11px] text-slate-400">Motor que gera o texto dos artigos</p>
                  </div>
                </div>

                {/* Provider selector */}
                <div className="grid grid-cols-3 gap-2">
                  {AI_PROVIDERS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => { setCfgProvider(p.value); setCfgModel(""); }}
                      className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        cfgProvider === p.value
                          ? "border-[#0B2A66] bg-[#EEF2FF] dark:bg-blue-950/40 dark:border-blue-500"
                          : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"
                      }`}
                    >
                      <span className={`text-xs font-semibold ${cfgProvider === p.value ? "text-[#0B2A66] dark:text-blue-300" : "text-slate-700 dark:text-slate-300"}`}>
                        {p.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{p.hint}</span>
                    </button>
                  ))}
                </div>

                {/* API key — only for paid providers */}
                {cfgProvider !== "gemini_free" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Key size={11} /> Chave de API {cfgProvider === "openai" ? "(OpenAI)" : "(Google AI)"}
                      {aiSettings?.hasKey && <span className="text-green-600 dark:text-green-400 text-[10px]">· salvo</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={cfgApiKey}
                        onChange={e => setCfgApiKey(e.target.value)}
                        placeholder={aiSettings?.hasKey ? "••••••••••••••••" : cfgProvider === "openai" ? "sk-..." : "AIza..."}
                        className="w-full pr-10 pl-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25 focus:border-[#0B2A66] font-mono transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Model name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Cpu size={11} /> Modelo (opcional)
                  </label>
                  <input
                    type="text"
                    value={cfgModel}
                    onChange={e => setCfgModel(e.target.value)}
                    placeholder={cfgProvider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash"}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25 font-mono"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700" />

              {/* ── Output prompt ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center">
                    <MessageSquare size={14} className="text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Prompt de saída</p>
                    <p className="text-[11px] text-slate-400">Instruções para a IA ao gerar cada artigo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCfgOutputPrompt(DEFAULT_OUTPUT_PROMPT)}
                    className="text-[11px] text-[#0B2A66] hover:underline dark:text-blue-400"
                  >
                    Restaurar padrão
                  </button>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Use <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{"{title}"}</code>,{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{"{text}"}</code>,{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{"{sourceName}"}</code> e{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{"{creditLine}"}</code> no prompt. Deixe vazio para usar o padrão.
                  </p>
                  <textarea
                    value={cfgOutputPrompt}
                    onChange={e => setCfgOutputPrompt(e.target.value)}
                    rows={10}
                    placeholder="Deixe vazio para usar o prompt padrão…"
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 resize-y focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                  />
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={saveAiSettings}
                disabled={settingsSaving}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B2A66] text-white font-semibold text-sm hover:bg-[#0a2255] disabled:opacity-50 transition-colors shadow-md"
              >
                {settingsSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {settingsSaving ? "Salvando…" : "Salvar configurações"}
              </button>
            </div>
          </div>
        )}

        {/* ── Input card ── */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5 shadow-sm">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">URL da fonte</label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && !loading && generate()}
                  placeholder="https://g1.globo.com/noticia... ou https://youtu.be/..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25 focus:border-[#0B2A66] transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Colar da área de transferência"
              >
                <ClipboardPaste size={15} /> Colar
              </button>
            </div>

            {/* Source type badge */}
            {sourceBadge && url.startsWith("http") && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${sourceBadge.color}`}>
                  <sourceBadge.Icon size={11} /> {sourceBadge.label} detectado
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Editoria</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Crédito da fonte</label>
              <label className="flex items-center gap-3 h-10 px-3 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <input
                  type="checkbox"
                  checked={giveCredit}
                  onChange={e => setGiveCredit(e.target.checked)}
                  className="w-4 h-4 accent-[#0B2A66]"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Citar a fonte no artigo</span>
              </label>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={loading || !url.startsWith("http")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B2A66] text-white font-semibold text-sm hover:bg-[#0a2255] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            {loading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {loading ? "Gerando artigo…" : "Gerar artigo com IA"}
            {!loading && <ArrowRight size={15} />}
          </button>
        </div>

        {/* ── Progress steps ── */}
        {loading && step >= 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="space-y-3">
              {STEPS.map((s, i) => {
                const SIcon = s.icon;
                const done    = i < step;
                const active  = i === step;
                const pending = i > step;
                return (
                  <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-xl transition-all ${active ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      done    ? "bg-green-500 text-white" :
                      active  ? "bg-[#0B2A66] text-white" :
                                "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    }`}>
                      {done ? <CheckCircle size={14} /> : <SIcon size={14} className={active ? "animate-pulse" : ""} />}
                    </div>
                    <span className={`text-sm font-medium ${
                      done    ? "text-green-600 dark:text-green-400 line-through opacity-60" :
                      active  ? "text-[#0B2A66] dark:text-blue-300" :
                                "text-slate-400"
                    }`}>{s.label}</span>
                    {active && <RefreshCw size={12} className="ml-auto animate-spin text-[#0B2A66] dark:text-blue-300" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {result && !loading && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Result header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle size={13} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">Artigo gerado!</span>
                <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-1">
                  <ExternalLink size={11} /> {result.sourceName}
                </a>
              </div>
              <button onClick={clearResult} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  previewTab === "preview"
                    ? "border-[#0B2A66] text-[#0B2A66] dark:text-blue-300 dark:border-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Eye size={14} /> Pré-visualização
              </button>
              <button
                onClick={() => setPreviewTab("edit")}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  previewTab === "edit"
                    ? "border-[#0B2A66] text-[#0B2A66] dark:text-blue-300 dark:border-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Pencil size={14} /> Editar campos
              </button>
            </div>

            {/* Preview tab */}
            {previewTab === "preview" && (
              <div className="p-6">
                {/* Article preview card */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-950">
                  {/* Featured image */}
                  {editImageUrl && (
                    <div className="relative">
                      <img
                        src={editImageUrl}
                        alt="Capa"
                        className="w-full max-h-72 object-cover"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                      />
                    </div>
                  )}
                  {!editImageUrl && (
                    <div className="w-full h-24 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5"><Image size={14} /> Sem imagem de capa</span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-6 space-y-3">
                    {/* Chapéu */}
                    <div>
                      <span className="inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
                        style={{ backgroundColor: "#c8102e", color: "#fff" }}>
                        {categories.find(c => c.value === (result.category || category))?.tag ?? (result.category || category).toUpperCase()}
                      </span>
                    </div>
                    {/* Title */}
                    <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100 font-serif">
                      {editTitle || <span className="text-slate-400 italic">Sem título</span>}
                    </h1>
                    {/* Subtitle */}
                    {editSubtitle && (
                      <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed border-l-4 border-slate-200 dark:border-slate-700 pl-4">
                        {editSubtitle}
                      </p>
                    )}
                    {/* Divider */}
                    <div className="flex items-center gap-3 pt-1 pb-2">
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                      <span className="text-[10px] text-slate-400 shrink-0">Redação</span>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    </div>
                    {/* Body HTML */}
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert text-slate-800 dark:text-slate-200
                        prose-p:leading-relaxed prose-p:mb-4
                        prose-h2:text-base prose-h2:font-bold prose-h2:mt-5 prose-h2:mb-2
                        prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-1
                        prose-strong:font-semibold prose-a:text-[#0B2A66] prose-a:underline"
                      dangerouslySetInnerHTML={{ __html: editContent }}
                    />
                    {/* Keywords */}
                    {editKeywords && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                        {editKeywords.split(",").map(k => k.trim()).filter(Boolean).map(k => (
                          <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-5">
                  <button
                    onClick={() => saveArticle("draft")}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                    Salvar como rascunho
                  </button>
                  <button
                    onClick={() => saveArticle("published")}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold hover:bg-[#0a2255] disabled:opacity-50 transition-colors shadow-md"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Publicar agora
                  </button>
                </div>
              </div>
            )}

            {/* Edit tab */}
            {previewTab === "edit" && (
              <div className="p-6 space-y-5">
                {/* Image preview */}
                {editImageUrl && (
                  <div className="relative group">
                    <img
                      src={editImageUrl}
                      alt="Capa"
                      className="w-full h-44 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}

                {/* Image URL input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Image size={12} /> URL da imagem de capa
                  </label>
                  <input
                    type="url"
                    value={editImageUrl}
                    onChange={e => setEditImageUrl(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Pencil size={12} /> Título
                    <span className="ml-auto text-[10px] font-mono text-slate-400">{editTitle.length} chars</span>
                  </label>
                  <textarea
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                  />
                </div>

                {/* Subtitle */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <FileText size={12} /> Subtítulo / Lide
                  </label>
                  <textarea
                    value={editSubtitle}
                    onChange={e => setEditSubtitle(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                  />
                </div>

                {/* Keywords + slug */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Tag size={12} /> Palavras-chave
                    </label>
                    <input
                      value={editKeywords}
                      onChange={e => setEditKeywords(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                      placeholder="palavra1, palavra2…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Link2 size={12} /> Slug URL
                    </label>
                    <input
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                      placeholder="meu-artigo-url"
                    />
                  </div>
                </div>

                {/* Content toggle */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowContent(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen size={14} /> Conteúdo HTML do artigo
                    </span>
                    {showContent ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {showContent && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={16}
                        className="w-full px-4 py-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 resize-y focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/25"
                      />
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => saveArticle("draft")}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                    Salvar como rascunho
                  </button>
                  <button
                    onClick={() => saveArticle("published")}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold hover:bg-[#0a2255] disabled:opacity-50 transition-colors shadow-md"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Publicar agora
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tips ── */}
        {!result && !loading && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Youtube, color: "text-red-500 bg-red-50 dark:bg-red-950/30", title: "YouTube", desc: "Cole a URL de qualquer vídeo. A IA transforma o conteúdo em artigo editorial." },
              { icon: FileText, color: "text-blue-500 bg-blue-50 dark:bg-blue-950/30", title: "Notícias", desc: "G1, Folha, UOL, Metrópoles, Correio e mais. A IA reescreve com voz própria." },
              { icon: Globe, color: "text-green-500 bg-green-50 dark:bg-green-950/30", title: "Qualquer site", desc: "Blogs, press releases, portais institucionais. Se tem texto, gera artigo." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon size={18} />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && !loading && !result && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Gerados recentemente</p>
              <button
                onClick={() => { setHistory([]); saveHistory([]); }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >Limpar</button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {history.slice(0, 8).map(h => {
                const cat = categories.find(c => c.value === h.category);
                return (
                  <div key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                      <Bot size={14} className="text-[#0B2A66] dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{h.title || h.url}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{h.url}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cat && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          {cat.label}
                        </span>
                      )}
                      <button
                        onClick={() => setUrl(h.url)}
                        className="text-xs text-[#0B2A66] dark:text-blue-400 hover:underline font-medium"
                      >
                        Usar URL
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
