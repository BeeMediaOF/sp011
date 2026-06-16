import React, { useState, useEffect, useRef } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  Play, Square, CheckCircle2, ArrowRight, Download, Wand2,
  Upload, Loader2, RefreshCw, AlertCircle, SkipForward,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineStep = "idle" | "collecting" | "rewriting" | "publishing" | "done";
type ArticleStatus =
  | "pending" | "rewriting" | "rewritten"
  | "publishing" | "published" | "duplicate" | "error" | "skipped";

interface RssSource {
  id: string; name: string; url: string; category: string;
  active: boolean; giveCredit: boolean; customPrompt?: string;
}

interface PipelineArticle {
  sourceId: string; sourceName: string; category: string;
  title: string; link: string; pubDate: string;
  imageUrl: string; excerpt: string; fullText: string;
  isDuplicate?: boolean;
  selected: boolean;
  status: ArticleStatus;
  rewritten?: string; keywords?: string; slug?: string;
  aiTitle?: string; aiSubtitle?: string;
  error?: string;
}

interface LogEntry { id: number; time: string; message: string; type: "info" | "success" | "error" | "warn"; }

// ─── API helper ───────────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem("admin_token") ?? "";
  const res = await fetch(`/api/admin/rss${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  const data = await res.json() as T;
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<ArticleStatus, { label: string; cls: string; spin?: boolean }> = {
  pending:    { label: "Pendente",     cls: "bg-gray-100 text-gray-500" },
  rewriting:  { label: "Reescrevendo", cls: "bg-purple-50 text-purple-600", spin: true },
  rewritten:  { label: "Reescrito",   cls: "bg-purple-100 text-purple-700" },
  publishing: { label: "Publicando",  cls: "bg-amber-50 text-amber-600", spin: true },
  published:  { label: "Publicado",   cls: "bg-green-100 text-green-700" },
  duplicate:  { label: "Duplicado",   cls: "bg-orange-50 text-orange-500" },
  error:      { label: "Erro",        cls: "bg-red-50 text-red-500" },
  skipped:    { label: "Pulado",      cls: "bg-gray-100 text-gray-400" },
};

function StatusBadge({ status }: { status: ArticleStatus }) {
  const { label, cls, spin } = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {spin && <Loader2 size={10} className="animate-spin" />}
      {status === "published" && <CheckCircle2 size={10} />}
      {status === "error" && <AlertCircle size={10} />}
      {status === "skipped" && <SkipForward size={10} />}
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Pipeline() {
  const [sources, setSources]               = useState<RssSource[]>([]);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [articles, setArticles]             = useState<PipelineArticle[]>([]);
  const [logs, setLogs]                     = useState<LogEntry[]>([]);
  const [step, setStep]                     = useState<PipelineStep>("idle");
  const [running, setRunning]               = useState(false);
  const stopRef   = useRef(false);
  const logId     = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ sources: RssSource[] }>("/sources")
      .then(({ sources }) => {
        const active = sources.filter((s) => s.active);
        setSources(active);
        setSelectedIds(new Set(active.map((s) => s.id)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function log(message: string, type: LogEntry["type"] = "info") {
    const id = ++logId.current;
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((l) => [...l, { id, time, message, type }]);
  }

  // ── Collect ──────────────────────────────────────────────────────────────

  async function doCollect(): Promise<PipelineArticle[]> {
    setStep("collecting");
    setArticles([]);
    log("Iniciando coleta...", "info");

    const targets = sources.filter((s) => selectedIds.has(s.id));
    if (!targets.length) { log("Nenhuma fonte selecionada.", "error"); setStep("idle"); return []; }

    const collected: PipelineArticle[] = [];
    for (const src of targets) {
      if (stopRef.current) break;
      log(`Buscando: ${src.name}…`, "info");
      try {
        const data = await api<{ articles: Omit<PipelineArticle, "selected" | "status">[] }>("/fetch", {
          method: "POST", body: JSON.stringify({ sourceId: src.id }),
        });
        const arts: PipelineArticle[] = data.articles.map((a) => ({
          ...a, selected: !a.isDuplicate,
          status: (a.isDuplicate ? "duplicate" : "pending") as ArticleStatus,
        }));
        collected.push(...arts);
        const news = arts.filter((a) => !a.isDuplicate).length;
        log(`✓ ${src.name}: ${news} novo(s), ${arts.length - news} duplicado(s)`, "success");
      } catch (err) {
        log(`✗ ${src.name}: ${String(err)}`, "error");
      }
    }

    setArticles(collected);
    if (!collected.length) { log("Nenhum artigo encontrado.", "warn"); setStep("idle"); return []; }
    log(`Total: ${collected.filter((a) => !a.isDuplicate).length} artigo(s) para processar.`, "info");
    return collected;
  }

  // ── Rewrite ──────────────────────────────────────────────────────────────

  async function doRewrite(input: PipelineArticle[]): Promise<PipelineArticle[]> {
    setStep("rewriting");
    const working = [...input];
    const toRewrite = working.filter((a) => a.selected && !a.isDuplicate && a.status === "pending");
    log(`Reescrevendo ${toRewrite.length} artigo(s)…`, "info");

    for (const art of toRewrite) {
      const idx = working.findIndex((a) => a.link === art.link);
      if (idx < 0) continue;

      if (stopRef.current) {
        working[idx] = { ...working[idx], status: "skipped" };
        setArticles([...working]);
        continue;
      }

      working[idx] = { ...working[idx], status: "rewriting" };
      setArticles([...working]);
      log(`Reescrevendo: "${art.title.slice(0, 60)}"…`, "info");

      try {
        const src = sources.find((s) => s.id === art.sourceId);
        const data = await api<{ rewritten: string; keywords: string; slug: string; title: string; subtitle: string }>("/rewrite", {
          method: "POST",
          body: JSON.stringify({
            title: art.title, text: art.fullText,
            sourceName: art.sourceName, giveCredit: src?.giveCredit ?? true,
            customPrompt: src?.customPrompt,
          }),
        });
        working[idx] = { ...working[idx], status: "rewritten", rewritten: data.rewritten, keywords: data.keywords, slug: data.slug, aiTitle: data.title || undefined, aiSubtitle: data.subtitle || undefined };
        setArticles([...working]);
        log(`✓ Reescrito: "${art.title.slice(0, 55)}"`, "success");
      } catch (err) {
        working[idx] = { ...working[idx], status: "error", error: String(err) };
        setArticles([...working]);
        log(`✗ Erro: ${String(err)}`, "error");
      }
    }

    log("Reescrita concluída.", "info");
    return working;
  }

  // ── Publish ──────────────────────────────────────────────────────────────

  async function doPublish(input: PipelineArticle[]): Promise<PipelineArticle[]> {
    setStep("publishing");
    const working = [...input];
    const toPublish = working.filter((a) => a.status === "rewritten");
    log(`Publicando ${toPublish.length} artigo(s)…`, "info");

    for (const art of toPublish) {
      const idx = working.findIndex((a) => a.link === art.link);
      if (idx < 0) continue;
      if (stopRef.current) break;

      working[idx] = { ...working[idx], status: "publishing" };
      setArticles([...working]);
      log(`Publicando: "${art.title.slice(0, 55)}"…`, "info");

      try {
        await api("/import", {
          method: "POST",
          body: JSON.stringify({
            title:    art.aiTitle    ?? art.title,
            subtitle: art.aiSubtitle ?? art.excerpt,
            content: art.rewritten ?? art.fullText,
            category: art.category, imageUrl: art.imageUrl,
            author: `Redação (via ${art.sourceName})`,
            status: "published", aiRewritten: true,
            keywords: art.keywords, slug: art.slug,
            rssSourceId: art.sourceId, rssSourceName: art.sourceName, rssSourceUrl: art.link,
          }),
        });
        working[idx] = { ...working[idx], status: "published" };
        setArticles([...working]);
        log(`✓ Publicado: "${art.title.slice(0, 55)}"`, "success");
      } catch (err) {
        working[idx] = { ...working[idx], status: "error", error: String(err) };
        setArticles([...working]);
        log(`✗ Erro ao publicar: ${String(err)}`, "error");
      }
    }

    setStep("done");
    const pub = working.filter((a) => a.status === "published").length;
    const err = working.filter((a) => a.status === "error").length;
    log(`Pipeline concluído! ${pub} publicado(s)${err ? `, ${err} erro(s)` : ""}.`, pub > 0 ? "success" : "warn");
    return working;
  }

  // ── Orchestration ─────────────────────────────────────────────────────────

  async function runAll() {
    stopRef.current = false;
    setRunning(true);
    setLogs([]);
    try {
      const collected = await doCollect();
      if (stopRef.current || !collected.length) return;
      const rewritten = await doRewrite(collected);
      if (stopRef.current) return;
      await doPublish(rewritten);
    } finally { setRunning(false); }
  }

  async function runCollectOnly() {
    stopRef.current = false; setRunning(true); setLogs([]);
    try { await doCollect(); } finally { setRunning(false); }
  }

  async function runRewriteOnly() {
    stopRef.current = false; setRunning(true);
    try { const r = await doRewrite(articles); setArticles(r); } finally { setRunning(false); }
  }

  async function runPublishOnly() {
    stopRef.current = false; setRunning(true);
    try { const r = await doPublish(articles); setArticles(r); } finally { setRunning(false); }
  }

  function stop() { stopRef.current = true; setRunning(false); log("Pipeline interrompido.", "warn"); }
  function reset() { setArticles([]); setLogs([]); setStep("idle"); setRunning(false); stopRef.current = false; }

  function toggleSource(id: string) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAllSources() {
    setSelectedIds(selectedIds.size === sources.length ? new Set() : new Set(sources.map((s) => s.id)));
  }
  function toggleAllArticles(checked: boolean) {
    setArticles((p) => p.map((a) => (a.isDuplicate ? a : { ...a, selected: checked })));
  }
  function toggleArticle(link: string) {
    setArticles((p) => p.map((a) => (a.link === link ? { ...a, selected: !a.selected } : a)));
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total:     articles.length,
    selected:  articles.filter((a) => a.selected && !a.isDuplicate).length,
    dupes:     articles.filter((a) => a.isDuplicate).length,
    rewritten: articles.filter((a) => ["rewritten", "publishing", "published"].includes(a.status)).length,
    published: articles.filter((a) => a.status === "published").length,
    errors:    articles.filter((a) => a.status === "error").length,
  };

  const hasPending   = articles.some((a) => a.selected && !a.isDuplicate && a.status === "pending");
  const hasRewritten = articles.some((a) => a.status === "rewritten");

  const STEPS = [
    { key: "collecting",  label: "① Coleta",    Icon: Download },
    { key: "rewriting",   label: "② Reescrita",  Icon: Wand2 },
    { key: "publishing",  label: "③ Publicação", Icon: Upload },
  ] as const;

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Pipeline de Conteúdo" noPadding>
      <div className="h-full flex flex-col overflow-hidden bg-gray-50">

        {/* ── Stepper bar ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b px-6 py-3 flex items-center gap-1 shrink-0">
          {STEPS.map(({ key, label, Icon }, i) => {
            const done   = step === "done" || stepIdx > i;
            const active = step !== "idle" && step !== "done" && STEPS[stepIdx]?.key === key;
            return (
              <React.Fragment key={key}>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${done   ? "text-green-600"
                  : active ? "text-[#0b3d91] bg-blue-50"
                  :          "text-gray-400"}`}>
                  {done
                    ? <CheckCircle2 size={15} className="text-green-500" />
                    : <Icon size={15} className={active ? "text-[#0b3d91]" : "text-gray-300"} />}
                  <span>{label}</span>
                  {active && running && <Loader2 size={13} className="animate-spin text-[#0b3d91]" />}
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight size={13} className={stepIdx > i || step === "done" ? "text-green-400" : "text-gray-200"} />
                )}
              </React.Fragment>
            );
          })}

          {/* Right stats */}
          {stats.total > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
              <span>{stats.total} artigos</span>
              {stats.dupes > 0     && <span className="text-orange-500">{stats.dupes} dup.</span>}
              {stats.rewritten > 0 && <span className="text-purple-600">{stats.rewritten} reescritos</span>}
              {stats.published > 0 && <span className="text-green-600 font-semibold">{stats.published} publicados</span>}
              {stats.errors > 0    && <span className="text-red-500">{stats.errors} erros</span>}
            </div>
          )}
        </div>

        {/* ── Controls ────────────────────────────────────────────────────── */}
        <div className="bg-white border-b px-6 py-3 flex flex-wrap items-center gap-3 shrink-0">
          {/* Source chips */}
          <div className="flex flex-wrap gap-1.5 items-center min-w-0">
            <span className="text-xs text-gray-400 font-medium shrink-0">Fontes:</span>
            <button
              onClick={toggleAllSources}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors shrink-0
                ${selectedIds.size === sources.length
                  ? "bg-[#0b3d91] text-white border-[#0b3d91]"
                  : "bg-white text-gray-500 border-gray-300 hover:border-[#0b3d91]"}`}>
              Todas
            </button>
            {sources.map((src) => (
              <button key={src.id} onClick={() => toggleSource(src.id)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors
                  ${selectedIds.has(src.id)
                    ? "bg-[#0b3d91]/10 text-[#0b3d91] border-[#0b3d91]/40"
                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"}`}>
                {src.name}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {running ? (
              <button onClick={stop}
                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                <Square size={13} fill="white" /> Parar
              </button>
            ) : (
              <>
                <button onClick={() => { void runCollectOnly(); }} disabled={!selectedIds.size}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40">
                  <Download size={12} /> Coletar
                </button>
                {hasPending && (
                  <button onClick={() => { void runRewriteOnly(); }}
                    className="flex items-center gap-1.5 border border-purple-300 text-purple-700 bg-white hover:bg-purple-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    <Wand2 size={12} /> Reescrever
                  </button>
                )}
                {hasRewritten && (
                  <button onClick={() => { void runPublishOnly(); }}
                    className="flex items-center gap-1.5 border border-green-300 text-green-700 bg-white hover:bg-green-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                    <Upload size={12} /> Publicar
                  </button>
                )}
                <button onClick={() => { void runAll(); }} disabled={!selectedIds.size}
                  className="flex items-center gap-2 bg-[#0b3d91] hover:bg-[#0b3d91]/90 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40">
                  <Play size={13} fill="white" /> Executar tudo
                </button>
                {(articles.length > 0 || logs.length > 0) && (
                  <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2">
                    <RefreshCw size={11} /> Limpar
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Body: articles + log ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Article table */}
          <div className="flex-1 overflow-y-auto">
            {articles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none py-20">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Play size={28} className="text-gray-300 ml-1" />
                </div>
                <p className="text-sm font-medium text-gray-500">Selecione as fontes e clique em <strong>Executar tudo</strong></p>
                <p className="text-xs mt-1 text-gray-400">ou rode cada etapa individualmente com os botões acima</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b z-10 shadow-sm">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox"
                        checked={articles.filter((a) => !a.isDuplicate).length > 0 && articles.filter((a) => !a.isDuplicate).every((a) => a.selected)}
                        onChange={(e) => toggleAllArticles(e.target.checked)} />
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Título</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden md:table-cell">Fonte</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide hidden lg:table-cell">Categoria</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {articles.map((art, i) => (
                    <tr key={art.link || i}
                      className={`transition-colors ${art.isDuplicate ? "opacity-40 bg-gray-50" : "bg-white hover:bg-gray-50"}`}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={art.selected}
                          disabled={art.isDuplicate}
                          onChange={() => toggleArticle(art.link)} />
                      </td>
                      <td className="px-4 py-2.5 max-w-xs lg:max-w-md xl:max-w-xl">
                        <p className="truncate text-gray-800 font-medium text-sm">{art.title}</p>
                        {art.error && (
                          <p className="text-[11px] text-red-400 truncate mt-0.5">{art.error}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">{art.sourceName}</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span className="text-[11px] font-semibold uppercase text-gray-400 tracking-wide">{art.category}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusBadge status={art.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Log panel */}
          {logs.length > 0 && (
            <div className="border-t bg-gray-950 text-gray-200 shrink-0" style={{ height: "160px" }}>
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-800">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Log</span>
                <button onClick={() => setLogs([])} className="ml-auto text-[10px] text-gray-500 hover:text-gray-300">limpar</button>
              </div>
              <div className="overflow-y-auto h-[120px] px-4 py-2 space-y-0.5 font-mono text-[11px]">
                {logs.map((entry) => (
                  <div key={entry.id}
                    className={`flex gap-2 ${
                      entry.type === "success" ? "text-green-400"
                      : entry.type === "error"   ? "text-red-400"
                      : entry.type === "warn"    ? "text-yellow-400"
                      : "text-gray-400"}`}>
                    <span className="text-gray-600 shrink-0">{entry.time}</span>
                    <span className="break-all">{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
