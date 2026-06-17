import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import {
  Save, Send, Eye, ChevronDown, ChevronRight,
  Image as ImageIcon, X, CheckCircle, Sparkles, Loader2,
  Bold, Italic, Underline, Strikethrough, Link as LinkIcon,
  List, ListOrdered, Quote, Video, Table,
  MoreHorizontal, Heading2, Heading3, ImagePlus,
  GalleryHorizontal, AlertCircle, Wand2,
} from "lucide-react";

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

const CATEGORIES = [
  { value: "cidades",    label: "Cidades"    },
  { value: "politica",   label: "Política"   },
  { value: "economia",   label: "Economia"   },
  { value: "esportes",   label: "Esportes"   },
  { value: "cultura",    label: "Cultura"    },
  { value: "transito",   label: "Trânsito"   },
  { value: "saude",      label: "Saúde"      },
  { value: "educacao",   label: "Educação"   },
  { value: "brasil",     label: "Brasil"     },
  { value: "mundo",      label: "Mundo"      },
  { value: "tecnologia", label: "Tecnologia" },
  { value: "geral",      label: "Geral"      },
];

const TAG_MAP: Record<string, string> = {
  cidades:"CIDADES", politica:"POLÍTICA", economia:"ECONOMIA",
  esportes:"ESPORTES", cultura:"CULTURA", transito:"TRÂNSITO",
  saude:"SAÚDE", educacao:"EDUCAÇÃO", brasil:"BRASIL",
  mundo:"MUNDO", tecnologia:"TECNOLOGIA", geral:"GERAL",
};

const empty: Partial<Article> = {
  title: "", subtitle: "", content: "", category: "geral",
  tag: "GERAL", imageUrl: "", author: "Redação", status: "draft",
};

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
      <Wand2 size={9} /> IA
    </span>
  );
}

function slugify(s: string) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-")
    .slice(0, 80);
}

function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export default function ArticleEdit() {
  const [, navigate]                = useLocation();
  const [matchEdit, paramsEdit]     = useRoute("/admin/artigos/:id");
  const isNew     = !matchEdit || paramsEdit?.id === "novo";
  const articleId = isNew ? null : (paramsEdit?.id ?? null);

  const [form, setForm]               = useState<Partial<Article>>(empty);
  const [slug, setSlug]               = useState("");
  const [tags, setTags]               = useState<string[]>([]);
  const [tagInput, setTagInput]       = useState("");
  const [seoTitle, setSeoTitle]       = useState("");
  const [seoDesc, setSeoDesc]         = useState("");
  const [scheduleAt, setScheduleAt]   = useState("");

  const [loading, setLoading]         = useState(!isNew);
  const [saving, setSaving]           = useState(false);
  const [rewriting, setRewriting]     = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [dragOver, setDragOver]       = useState(false);

  const contentRef    = useRef<HTMLTextAreaElement>(null);
  const imageRef      = useRef<HTMLInputElement>(null);
  const dropRef       = useRef<HTMLDivElement>(null);
  const autofillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which values came from user vs. autofill so we don't overwrite user edits
  const userEditedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isNew && articleId) {
      setLoading(true);
      adminApi.getArticle(articleId)
        .then((r) => {
          setForm(r.article);
          setSlug(r.article.slug ?? slugify(r.article.title ?? ""));
          // Mark pre-existing fields as user-edited so autofill won't overwrite them
          const preExisting = new Set<string>();
          if (r.article.subtitle?.trim()) preExisting.add("subtitle");
          if (r.article.keywords?.trim()) preExisting.add("summary");
          userEditedRef.current = preExisting;
        })
        .catch(() => setError("Artigo não encontrado"))
        .finally(() => setLoading(false));
    }
  }, [articleId, isNew]);

  // Auto-generate slug from title (only for new articles)
  useEffect(() => {
    if (isNew) setSlug(slugify(form.title ?? ""));
  }, [form.title, isNew]);

  // ── Debounced autofill — triggers 1.5s after title/content stabilises ──
  useEffect(() => {
    const title   = form.title ?? "";
    const content = form.content ?? "";
    if (title.trim().length < 10) return; // need at least some title text

    if (autofillTimer.current) clearTimeout(autofillTimer.current);
    autofillTimer.current = setTimeout(() => {
      setAutofilling(true);
      adminApi.autofillArticle(title, content)
        .then((ai) => {
          const filled = new Set<string>();

          // Subtitle — fill if empty and user hasn't edited it
          if (ai.subtitle && !userEditedRef.current.has("subtitle") && !form.subtitle?.trim()) {
            setField("subtitle", ai.subtitle);
            filled.add("subtitle");
          }
          // Summary/keywords — fill if empty
          if (ai.summary && !userEditedRef.current.has("summary") && !form.keywords?.trim()) {
            setField("keywords", ai.summary);
            filled.add("summary");
          }
          // Tags — fill if empty
          if (ai.tags.length > 0 && !userEditedRef.current.has("tags") && tags.length === 0) {
            setTags(ai.tags);
            filled.add("tags");
          }
          // SEO Title — fill if empty
          if (ai.seoTitle && !userEditedRef.current.has("seoTitle") && !seoTitle.trim()) {
            setSeoTitle(ai.seoTitle.slice(0, 60));
            filled.add("seoTitle");
          }
          // Meta description — fill if empty
          if (ai.metaDesc && !userEditedRef.current.has("metaDesc") && !seoDesc.trim()) {
            setSeoDesc(ai.metaDesc.slice(0, 160));
            filled.add("metaDesc");
          }
          // Slug — only fill if it's still the auto-generated one (isNew) and not manually edited
          if (ai.slug && isNew && !userEditedRef.current.has("slug")) {
            setSlug(ai.slug.slice(0, 80));
            filled.add("slug");
          }
          if (filled.size > 0) setAiFilledFields(filled);
        })
        .catch(() => { /* silent — autofill is best-effort */ })
        .finally(() => setAutofilling(false));
    }, 1500);

    return () => { if (autofillTimer.current) clearTimeout(autofillTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, form.content]);

  function setField<K extends keyof Article>(key: K, value: Article[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCategoryChange(cat: string) {
    setField("category", cat);
    setField("tag", TAG_MAP[cat] ?? cat.toUpperCase());
  }

  function handleImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setField("imageUrl", e.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Toolbar actions ─────────────────────────────────────────
  function insertFormat(type: "bold"|"italic"|"underline"|"link"|"h2"|"h3"|"list"|"ordered"|"quote") {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end   = el.selectionEnd ?? 0;
    const sel   = el.value.slice(start, end);
    const before = el.value.slice(0, start);
    const after  = el.value.slice(end);
    let replacement = "";
    let cursorOffset = 0;
    switch (type) {
      case "bold":    replacement = `**${sel || "negrito"}**`;  cursorOffset = sel ? replacement.length : 2; break;
      case "italic":  replacement = `*${sel || "itálico"}*`;   cursorOffset = sel ? replacement.length : 1; break;
      case "underline": replacement = `<u>${sel || "texto"}</u>`; cursorOffset = sel ? replacement.length : 3; break;
      case "link":    replacement = `[${sel || "texto"}](https://url.com)`; cursorOffset = replacement.length - 1; break;
      case "h2":      replacement = `\n## ${sel || "Subtítulo"}\n`; cursorOffset = replacement.length; break;
      case "h3":      replacement = `\n### ${sel || "Subtítulo"}\n`; cursorOffset = replacement.length; break;
      case "list":    replacement = sel ? sel.split("\n").map((l) => `- ${l}`).join("\n") : `- item 1\n- item 2\n- item 3`; cursorOffset = replacement.length; break;
      case "ordered": replacement = sel ? sel.split("\n").map((l, i) => `${i+1}. ${l}`).join("\n") : `1. item 1\n2. item 2\n3. item 3`; cursorOffset = replacement.length; break;
      case "quote":   replacement = `\n> ${sel || "Citação importante"}\n`; cursorOffset = replacement.length; break;
    }
    const newVal = before + replacement + after;
    setField("content", newVal);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + cursorOffset;
      el.setSelectionRange(pos, pos);
    });
  }

  function addTag(v: string) {
    const t = v.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  const isPublished = form.status === "published";

  async function handleSave(intent: "draft" | "publish" | "update") {
    setError(""); setSuccess("");
    if (!form.title?.trim()) { setError("O título é obrigatório"); return; }
    setSaving(true);
    try {
      let newStatus: "draft" | "published" = form.status ?? "draft";
      if (intent === "draft")   newStatus = "draft";
      if (intent === "publish") newStatus = "published";

      const data: Partial<Article> = {
        ...form,
        status: newStatus,
        slug: slug || slugify(form.title ?? ""),
        keywords: tags.join(", "),
      };

      if (isNew) {
        const { article } = await adminApi.createArticle(data);
        setSuccess(newStatus === "published" ? "Artigo publicado!" : "Rascunho salvo!");
        setTimeout(() => navigate(`/admin/artigos/${article.id}`), 800);
      } else {
        const { article } = await adminApi.updateArticle(articleId!, data);
        if (intent === "publish" && article.status !== "published") {
          const { article: pub } = await adminApi.publishArticle(article.id);
          setForm(pub);
        } else {
          setForm(article);
        }
        const msg = intent === "publish" ? "Artigo publicado!" :
                    intent === "draft"   ? "Rascunho salvo"    :
                                          "Alterações salvas";
        setSuccess(msg);
        setTimeout(() => setSuccess(""), 2500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRewrite() {
    if (!articleId) return;
    setError(""); setSuccess("");
    setRewriting(true);
    try {
      const { article } = await adminApi.rewriteArticle(articleId);
      setForm(article);
      setSuccess("Reescrito com IA (SEO/AIO)!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro na reescrita com IA");
    } finally {
      setRewriting(false);
    }
  }

  const breadcrumb = (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
      <span className="hover:text-[#0B2A66] cursor-pointer" onClick={() => navigate("/admin")}>Dashboard</span>
      <ChevronRight size={11} />
      <span className="hover:text-[#0B2A66] cursor-pointer" onClick={() => navigate("/admin/artigos")}>Artigos</span>
      <ChevronRight size={11} />
      <span className="text-slate-600 font-medium">{isNew ? "Novo artigo" : "Editar artigo"}</span>
    </div>
  );

  const topbarActions = (
    <div className="flex items-center gap-2">
      {autofilling && (
        <span className="text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 bg-purple-50 text-purple-600">
          <Loader2 size={12} className="animate-spin" /> Preenchendo com IA…
        </span>
      )}
      {!autofilling && aiFilledFields.size > 0 && !error && !success && (
        <span className="text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 bg-purple-50 text-purple-600">
          <Wand2 size={12} /> Campos preenchidos por IA
        </span>
      )}
      {(error || success) && (
        <span className={`text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
          error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
        }`}>
          {error ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
          {error || success}
        </span>
      )}
      <button
        onClick={() => { void handleSave("draft"); }}
        disabled={saving}
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <Save size={14} /> Salvar rascunho
      </button>
      <a
        href={form.slug ? `/artigo/${form.slug}` : "#"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <Eye size={14} /> Pré-visualizar
      </a>
      <div className="flex rounded-xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
        <button
          onClick={() => { void handleSave(isPublished ? "update" : "publish"); }}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 text-white transition-colors disabled:opacity-60"
          style={{ background: "#E71D36" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {saving ? "Salvando…" : isPublished ? "Atualizar" : "Publicar"}
        </button>
        <button className="px-2.5 py-2 border-l border-red-700 text-white hover:bg-red-700 transition-colors" style={{ background: "#E71D36" }}>
          <ChevronDown size={13} />
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <AdminLayout title={isNew ? "Novo Artigo" : "Editar Artigo"} topbarExtra={topbarActions}>
        <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
          <Loader2 size={20} className="animate-spin" /> Carregando artigo…
        </div>
      </AdminLayout>
    );
  }

  const content = form.content ?? "";
  const words   = wordCount(content);

  return (
    <AdminLayout title={isNew ? "Novo Artigo" : "Editar Artigo"} topbarExtra={topbarActions}>
      {breadcrumb}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">

        {/* ══ Left column ══════════════════════════════════════════ */}
        <div className="space-y-5">

          {/* ── Core fields card ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: CARD_SHADOW }}>

            {/* Title + Slug row */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Título da matéria <span className="text-[#E71D36]">*</span>
                </label>
                <input
                  value={form.title ?? ""}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Digite o título da matéria"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 font-medium transition-colors"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                  Slug <span className="text-[#E71D36]">*</span>
                  {aiFilledFields.has("slug") && <AiBadge />}
                </label>
                <input
                  value={slug}
                  onChange={(e) => { userEditedRef.current.add("slug"); setSlug(slugify(e.target.value)); }}
                  placeholder="slug-da-materia"
                  className="w-full px-4 py-2.5 text-xs font-mono border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
                />
                <p className="text-[10px] text-slate-400 mt-1">URL amigável gerada automaticamente</p>
              </div>
            </div>

            {/* Subtitle */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Subtítulo {aiFilledFields.has("subtitle") && <AiBadge />}
              </label>
              <input
                value={form.subtitle ?? ""}
                onChange={(e) => { userEditedRef.current.add("subtitle"); setField("subtitle", e.target.value); }}
                placeholder="Digite o subtítulo da matéria (opcional)"
                className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors ${
                  aiFilledFields.has("subtitle") ? "border-purple-200" : "border-slate-200"
                }`}
              />
            </div>

            {/* Summary */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Resumo {aiFilledFields.has("summary") && <AiBadge />}
              </label>
              <textarea
                value={form.keywords ?? ""}
                onChange={(e) => { userEditedRef.current.add("summary"); setField("keywords", e.target.value); }}
                placeholder="Breve descrição ou destaque da matéria"
                rows={3}
                maxLength={160}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("summary") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">
                {(form.keywords ?? "").length}/160
              </p>
            </div>

            {/* Content editor */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Conteúdo <span className="text-[#E71D36]">*</span>
              </label>
              <div className="border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#0B2A66] transition-colors">
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-3 py-2 bg-slate-50 border-b border-slate-100 flex-wrap">
                  {/* Format select */}
                  <div className="relative mr-1">
                    <select className="text-xs font-medium text-slate-600 bg-transparent border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer pr-5">
                      <option>Parágrafo</option>
                      <option>Título H2</option>
                      <option>Título H3</option>
                      <option>Citação</option>
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                  </div>

                  <div className="w-px h-4 bg-slate-200 mx-1" />

                  {/* Format buttons */}
                  {[
                    { id: "bold",     Icon: Bold,          title: "Negrito" },
                    { id: "italic",   Icon: Italic,        title: "Itálico" },
                    { id: "underline",Icon: Underline,     title: "Sublinhado" },
                    { id: "strikethrough", Icon: Strikethrough, title: "Tachado", noAction: true },
                  ].map(({ id, Icon, title, noAction }) => (
                    <button
                      key={id}
                      type="button"
                      title={title}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!noAction) insertFormat(id as Parameters<typeof insertFormat>[0]);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-[#0B2A66] transition-colors"
                    >
                      <Icon size={13} />
                    </button>
                  ))}

                  <div className="w-px h-4 bg-slate-200 mx-1" />

                  {[
                    { id: "list",    Icon: List,         title: "Lista"       },
                    { id: "ordered", Icon: ListOrdered,  title: "Lista numerada" },
                    { id: "h2",      Icon: Heading2,     title: "Título H2"   },
                    { id: "h3",      Icon: Heading3,     title: "Título H3"   },
                    { id: "quote",   Icon: Quote,        title: "Citação"     },
                  ].map(({ id, Icon, title }) => (
                    <button
                      key={id}
                      type="button"
                      title={title}
                      onMouseDown={(e) => { e.preventDefault(); insertFormat(id as Parameters<typeof insertFormat>[0]); }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-[#0B2A66] transition-colors"
                    >
                      <Icon size={13} />
                    </button>
                  ))}

                  <div className="w-px h-4 bg-slate-200 mx-1" />

                  {[
                    { id: "link",  Icon: LinkIcon,  title: "Link" },
                    { id: "image", Icon: ImageIcon, title: "Imagem", noAction: true },
                    { id: "video", Icon: Video,     title: "Vídeo",  noAction: true },
                    { id: "table", Icon: Table,     title: "Tabela", noAction: true },
                    { id: "more",  Icon: MoreHorizontal, title: "Mais", noAction: true },
                  ].map(({ id, Icon, title, noAction }) => (
                    <button
                      key={id}
                      type="button"
                      title={title}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!noAction) insertFormat(id as Parameters<typeof insertFormat>[0]);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-[#0B2A66] transition-colors"
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </div>

                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setField("content", e.target.value)}
                  rows={14}
                  placeholder="Escreva o conteúdo da matéria aqui..."
                  className="w-full px-4 py-3 text-sm outline-none resize-y leading-relaxed placeholder:text-slate-300 bg-white"
                />
                <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
                  <span className="text-[11px] text-slate-400 font-mono">p</span>
                  <span className="text-[11px] text-slate-400">{words} palavras</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Featured image card ─────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <label className="block text-xs font-semibold text-slate-600 mb-3">
              Imagem de destaque <span className="text-[#E71D36]">*</span>
            </label>

            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
            />

            {form.imageUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={form.imageUrl}
                  alt="Imagem de destaque"
                  className="w-full h-52 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                />
                <button
                  type="button"
                  onClick={() => setField("imageUrl", "")}
                  className="absolute top-3 right-3 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f && f.type.startsWith("image/")) handleImageFile(f);
                }}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-[#0B2A66] bg-[#EEF2FF]" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                }`}
                onClick={() => imageRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <ImagePlus size={20} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-500">
                  Arraste e solte uma imagem aqui ou{" "}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); imageRef.current?.click(); }}
                    className="text-[#2563EB] font-semibold hover:underline"
                  >
                    Selecionar imagem
                  </button>
                </p>
                <p className="text-xs text-slate-400 mt-1.5">
                  Formatos: JPG, PNG ou WebP · Tamanho recomendado: 1200×630px
                </p>
              </div>
            )}

            {/* URL input */}
            <div className="mt-3">
              <input
                value={!form.imageUrl?.startsWith("data:") ? (form.imageUrl ?? "") : ""}
                onChange={(e) => setField("imageUrl", e.target.value)}
                placeholder="Ou cole uma URL de imagem"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
          </div>

          {/* ── Content blocks ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66] mb-1">Blocos de conteúdo</h3>
            <p className="text-xs text-slate-400 mb-4">Adicione elementos para enriquecer sua matéria.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: GalleryHorizontal, label: "Adicionar galeria",  desc: "Adicione uma galeria de imagens à matéria",    color: "#2563EB", bg: "#EEF4FF" },
                { icon: Video,             label: "Adicionar vídeo",    desc: "Incorpore um vídeo do YouTube ou Vimeo",       color: "#E71D36", bg: "#FEE2E2" },
                { icon: Quote,             label: "Adicionar citação",  desc: "Destaque citações importantes no texto",       color: "#0B2A66", bg: "#EEF2FF" },
              ].map(({ icon: Icon, label, desc, color, bg }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{label}</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ Right sidebar ════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Publication card ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66]">Publicação</h3>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Status <span className="text-[#E71D36]">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.status ?? "draft"}
                  onChange={(e) => setField("status", e.target.value as "draft" | "published")}
                  className="w-full pl-8 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                  style={{ background: form.status === "published" ? "#16A34A" : "#F59E0B" }}
                />
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Agendamento</label>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  placeholder="Publicar agora"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 text-slate-600"
                />
                <ChevronDown size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Deixe em branco para publicar imediatamente</p>
            </div>
          </div>

          {/* ── Metadata card ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Categoria <span className="text-[#E71D36]">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.category ?? "geral"}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="">Selecione uma categoria</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Tags {aiFilledFields.has("tags") && <AiBadge />}
              </label>
              <div className={`border rounded-xl bg-slate-50 px-3 py-2 focus-within:border-[#0B2A66] transition-colors ${
                aiFilledFields.has("tags") ? "border-purple-200" : "border-slate-200"
              }`}>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 text-[11px] font-semibold text-[#0B2A66] bg-[#EEF2FF] px-2 py-0.5 rounded-full">
                      {t}
                      <button type="button" onClick={() => { userEditedRef.current.add("tags"); setTags((prev) => prev.filter((x) => x !== t)); }}>
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => { userEditedRef.current.add("tags"); setTagInput(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder={tags.length ? "" : "Digite e pressione Enter para adicionar"}
                  className="text-sm bg-transparent outline-none w-full placeholder:text-slate-400"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Separe as tags com Enter</p>
            </div>

            {/* Autor */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Autor <span className="text-[#E71D36]">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.author ?? "Redação"}
                  onChange={(e) => setField("author", e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="Administrador (Você)">Administrador (Você)</option>
                  <option value="Redação">Redação</option>
                  <option value="Colunista">Colunista</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* RSS / AI info */}
            {form.origin === "rss" && (
              <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Importado via RSS</p>
                {form.rssSourceName && <p className="text-xs text-blue-700">Fonte: {form.rssSourceName}</p>}
                {form.aiRewritten
                  ? <p className="text-xs text-purple-600 font-semibold">✦ Reescrito com IA (SEO/AIO)</p>
                  : <p className="text-xs text-amber-600">⚠ Texto original — não reescrito pela IA</p>
                }
                {!isNew && articleId && (
                  <button
                    onClick={handleRewrite}
                    disabled={rewriting}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-60"
                  >
                    <Sparkles size={12} className={rewriting ? "animate-spin" : ""} />
                    {rewriting ? "Reescrevendo…" : form.aiRewritten ? "Re-escrever com IA" : "Reescrever com IA (SEO/AIO)"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── SEO card ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66]">SEO</h3>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Título SEO {aiFilledFields.has("seoTitle") && <AiBadge />}
              </label>
              <input
                value={seoTitle}
                onChange={(e) => { userEditedRef.current.add("seoTitle"); setSeoTitle(e.target.value.slice(0, 60)); }}
                placeholder="Título para SEO (opcional)"
                className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors ${
                  aiFilledFields.has("seoTitle") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{seoTitle.length}/60</p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Meta descrição {aiFilledFields.has("metaDesc") && <AiBadge />}
              </label>
              <textarea
                value={seoDesc}
                onChange={(e) => { userEditedRef.current.add("metaDesc"); setSeoDesc(e.target.value.slice(0, 160)); }}
                placeholder="Descrição para mecanismos de busca (opcional)"
                rows={3}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("metaDesc") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{seoDesc.length}/160</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
