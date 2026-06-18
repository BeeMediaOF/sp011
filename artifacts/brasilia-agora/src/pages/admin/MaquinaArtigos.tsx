import { useState, useRef } from "react";
import { useLocation } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { useToast } from "../../hooks/use-toast";
import {
  Bot, Link2, Youtube, Globe, Sparkles, RefreshCw,
  CheckCircle, AlertCircle, ClipboardPaste, ArrowRight,
  FileText, Image, Tag, Send, BookOpen, ChevronDown, ChevronUp,
  ExternalLink, Pencil, X,
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

const CATEGORIES = [
  { value: "politica",   label: "Política",    tag: "POLÍTICA" },
  { value: "cidade",     label: "Cidade",      tag: "CIDADE" },
  { value: "seguranca",  label: "Segurança",   tag: "SEGURANÇA" },
  { value: "esportes",   label: "Esportes",    tag: "ESPORTES" },
  { value: "saude",      label: "Saúde",       tag: "SAÚDE" },
  { value: "educacao",   label: "Educação",    tag: "EDUCAÇÃO" },
  { value: "cultura",    label: "Cultura",     tag: "CULTURA" },
  { value: "economia",   label: "Economia",    tag: "ECONOMIA" },
  { value: "tecnologia", label: "Tecnologia",  tag: "TECNOLOGIA" },
  { value: "mundo",      label: "Mundo",       tag: "MUNDO" },
  { value: "brasil",     label: "Brasil",      tag: "BRASIL" },
  { value: "transporte", label: "Transporte",  tag: "TRANSPORTE" },
  { value: "geral",      label: "Geral",       tag: "GERAL" },
];

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

export default function MaquinaArtigos() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

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

  const [saving, setSaving]         = useState(false);
  const [history, setHistory]       = useState<HistoryEntry[]>(loadHistory);

  const urlInputRef = useRef<HTMLInputElement>(null);

  const sourceType = detectSourceType(url);
  const sourceBadge = sourceType ? SOURCE_BADGE[sourceType] : null;

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
      const cat = CATEGORIES.find(c => c.value === (result.category || category));
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
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Máquina de Artigos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Cole a URL de qualquer notícia, artigo ou vídeo do YouTube e gere um artigo completo com IA em segundos.
            </p>
          </div>
        </div>

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
                {CATEGORIES.map(c => (
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle size={13} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">Artigo gerado com sucesso!</span>
                <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 ml-2">
                  <ExternalLink size={11} /> {result.sourceName}
                </a>
              </div>
              <button onClick={clearResult} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

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
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                    <label className="flex items-center gap-2 text-white text-sm font-medium cursor-pointer bg-black/50 px-4 py-2 rounded-lg">
                      <Image size={14} /> Trocar imagem
                      <input type="text" className="hidden" />
                    </label>
                  </div>
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
                const cat = CATEGORIES.find(c => c.value === h.category);
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
