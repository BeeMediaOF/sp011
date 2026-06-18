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
  GalleryHorizontal, AlertCircle, Wand2, Plus, Trash2,
  Youtube, Play, RefreshCw, Pencil,
  ClipboardPaste, AlignLeft, Zap,
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

  // ── Paste / format modal ─────────────────────────────────────
  const [pasteOpen, setPasteOpen]     = useState(false);
  const [pasteRaw, setPasteRaw]       = useState("");
  const [pasteMode, setPasteMode]     = useState<"replace" | "append">("replace");
  const [fillingSeo, setFillingSeo]   = useState(false);

  // ── Content block modals ────────────────────────────────────
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([""]);
  const [galleryInput, setGalleryInput] = useState("");

  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl]   = useState("");

  const [citationOpen, setCitationOpen] = useState(false);
  const [citationText, setCitationText] = useState("");
  const [citationAuthor, setCitationAuthor] = useState("");

  const [inlineImgOpen, setInlineImgOpen]     = useState(false);
  const [inlineImgUrl, setInlineImgUrl]       = useState("");
  const [inlineImgAlt, setInlineImgAlt]       = useState("");
  const [inlineImgAlign, setInlineImgAlign]   = useState<"left" | "center" | "right">("center");

  const [galleryUploadIdx, setGalleryUploadIdx] = useState(0);

  const contentRef      = useRef<HTMLTextAreaElement>(null);
  const imageRef        = useRef<HTMLInputElement>(null);
  const dropRef         = useRef<HTMLDivElement>(null);
  const galleryFileRef  = useRef<HTMLInputElement>(null);
  const inlineImgFileRef = useRef<HTMLInputElement>(null);
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

  // ── Text formatting helpers ───────────────────────────────────
  function toTitleCase(s: string) {
    const lower = ["de","do","da","dos","das","e","em","o","a","os","as","com","por","para","ao","aos"];
    return s.toLowerCase().replace(/\b\w+/g, (w, i) =>
      i === 0 || !lower.includes(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
    );
  }

  function formatParagraphText(raw: string): string {
    const lines = raw.split(/\r?\n/);
    const paras: string[] = [];
    let current: string[] = [];

    function flush() {
      if (!current.length) return;
      const text = current.join(" ").trim();
      current = [];
      if (!text) return;

      // ALL CAPS heading (only letters/accented + spaces + digits + punct, no lowercase)
      const noAccents = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isAllCaps = /^[A-Z0-9\s:–—.,'"""]{3,}$/.test(noAccents) && !/[a-z]/.test(noAccents) && text.length <= 80;
      if (isAllCaps) { paras.push(`## ${toTitleCase(text)}`); return; }

      // Numbered heading pattern: "1. HEADING" or "I. HEADING"
      const numberedCaps = text.match(/^(\d+\.|[IVX]+\.)\s+(.+)$/);
      if (numberedCaps && !/[a-z]/.test(numberedCaps[2]!)) {
        paras.push(`## ${toTitleCase(numberedCaps[2]!)}`); return;
      }

      // Bullet point
      if (/^[-•·*]\s/.test(text)) { paras.push(`- ${text.slice(2).trim()}`); return; }

      paras.push(text);
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flush(); } else { current.push(trimmed); }
    }
    flush();
    return paras.join("\n\n");
  }

  function handlePasteInsert() {
    const formatted = formatParagraphText(pasteRaw);
    if (!formatted) return;
    if (pasteMode === "replace") {
      setField("content", formatted);
    } else {
      const existing = (form.content ?? "").trimEnd();
      setField("content", existing ? `${existing}\n\n${formatted}` : formatted);
    }
    setPasteOpen(false);
    setPasteRaw("");
  }

  function handleFormatContent() {
    const current = form.content ?? "";
    if (!current.trim()) return;
    setField("content", formatParagraphText(current));
  }

  async function triggerSeoFill() {
    const title   = form.title ?? "";
    const content = form.content ?? "";
    if (!title.trim()) return;
    setFillingSeo(true);
    try {
      const ai = await adminApi.autofillArticle(title, content);
      if (ai.subtitle && !form.subtitle?.trim()) { setField("subtitle", ai.subtitle); setAiFilledFields((s) => new Set([...s, "subtitle"])); }
      if (ai.summary)   { setField("keywords", ai.summary);  setAiFilledFields((s) => new Set([...s, "summary"])); }
      if (ai.tags?.length) { setTags(ai.tags); setAiFilledFields((s) => new Set([...s, "tags"])); }
      if (ai.seoTitle)  { setSeoTitle(ai.seoTitle.slice(0, 60)); setAiFilledFields((s) => new Set([...s, "seoTitle"])); }
      if (ai.metaDesc)  { setSeoDesc(ai.metaDesc.slice(0, 160)); setAiFilledFields((s) => new Set([...s, "metaDesc"])); }
      if (ai.slug && isNew) { setSlug(ai.slug.slice(0, 80)); setAiFilledFields((s) => new Set([...s, "slug"])); }
      setSuccess("SEO / AIO preenchido com IA!");
      setTimeout(() => setSuccess(""), 2500);
    } catch {
      setError("Erro ao preencher SEO com IA");
      setTimeout(() => setError(""), 2500);
    } finally {
      setFillingSeo(false);
    }
  }

  // ── Block insertion helpers ───────────────────────────────────
  function appendToContent(block: string) {
    const current = form.content ?? "";
    const sep = current.trim() ? "\n\n" : "";
    setField("content", current + sep + block);
  }

  function insertGallery() {
    const valid = galleryImages.filter((u) => u.trim());
    if (!valid.length) return;
    const imgs = valid
      .map((u) => `<img src="${u.trim()}" alt="" style="width:100%;height:200px;object-fit:cover;border-radius:8px;" />`)
      .join("\n  ");
    const block = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:20px 0;">\n  ${imgs}\n</div>`;
    appendToContent(block);
    setGalleryOpen(false);
    setGalleryImages([""]);
  }

  function getYoutubeId(url: string) {
    const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
    return m?.[1] ?? null;
  }
  function getVimeoId(url: string) {
    const m = url.match(/vimeo\.com\/(\d+)/);
    return m?.[1] ?? null;
  }

  function insertVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    let embed = "";
    const ytId = getYoutubeId(url);
    const vimeoId = getVimeoId(url);
    if (ytId) {
      embed = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:20px 0;"><iframe src="https://www.youtube.com/embed/${ytId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:10px;border:0;" allowfullscreen></iframe></div>`;
    } else if (vimeoId) {
      embed = `<div style="position:relative;padding-bottom:56.25%;height:0;margin:20px 0;"><iframe src="https://player.vimeo.com/video/${vimeoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:10px;border:0;" allowfullscreen></iframe></div>`;
    } else {
      embed = `<div style="margin:20px 0;"><video src="${url}" controls style="width:100%;border-radius:10px;"></video></div>`;
    }
    appendToContent(embed);
    setVideoOpen(false);
    setVideoUrl("");
  }

  function insertCitation() {
    const text = citationText.trim();
    if (!text) return;
    const footer = citationAuthor.trim()
      ? `\n  <footer style="margin-top:10px;font-size:0.85em;color:#64748b;font-style:normal;">— ${citationAuthor.trim()}</footer>`
      : "";
    const block = `<blockquote style="border-left:4px solid #0B2A66;padding:14px 18px;margin:20px 0;background:#EEF2FF;border-radius:0 10px 10px 0;">\n  <p style="font-style:italic;color:#1e3a8a;margin:0;">"${text}"</p>${footer}\n</blockquote>`;
    appendToContent(block);
    setCitationOpen(false);
    setCitationText("");
    setCitationAuthor("");
  }

  function insertInlineImage() {
    const url = inlineImgUrl.trim();
    if (!url) return;
    const alt = inlineImgAlt.trim();
    let style = "";
    if (inlineImgAlign === "center") style = "display:block;margin:20px auto;max-width:100%;border-radius:8px;";
    else if (inlineImgAlign === "left") style = "float:left;margin:0 18px 12px 0;max-width:48%;border-radius:8px;";
    else style = "float:right;margin:0 0 12px 18px;max-width:48%;border-radius:8px;";
    const block = `<img src="${url}" alt="${alt}" style="${style}" />`;
    appendToContent(block);
    setInlineImgOpen(false);
    setInlineImgUrl("");
    setInlineImgAlt("");
    setInlineImgAlign("center");
  }

  function handleInlineImgFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setInlineImgUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleGalleryUploadFile(file: File, idx: number) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const copy = [...galleryImages];
      copy[idx] = e.target?.result as string;
      setGalleryImages(copy);
    };
    reader.readAsDataURL(file);
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

                  {/* Colar texto formatado */}
                  <button
                    type="button"
                    title="Colar texto formatado"
                    onMouseDown={(e) => { e.preventDefault(); setPasteRaw(""); setPasteOpen(true); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <ClipboardPaste size={12} /> Colar texto
                  </button>

                  {/* Formatar parágrafos */}
                  <button
                    type="button"
                    title="Formatar parágrafos automaticamente"
                    onMouseDown={(e) => { e.preventDefault(); handleFormatContent(); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <AlignLeft size={12} /> Formatar
                  </button>
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
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-semibold text-slate-600">
                Imagem de destaque <span className="text-[#E71D36]">*</span>
              </label>
              {form.imageUrl && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => imageRef.current?.click()}
                    className="flex items-center gap-1 text-[11px] font-medium text-[#2563EB] hover:underline"
                  >
                    <RefreshCw size={11} /> Trocar
                  </button>
                  <span className="text-slate-200">|</span>
                  <button
                    type="button"
                    onClick={() => setField("imageUrl", "")}
                    className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:underline"
                  >
                    <Trash2 size={11} /> Remover
                  </button>
                </div>
              )}
            </div>

            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
            />

            {form.imageUrl ? (
              <div
                className="group relative rounded-xl overflow-hidden border border-slate-100 cursor-pointer bg-slate-100"
                onClick={() => imageRef.current?.click()}
              >
                <img
                  src={form.imageUrl}
                  alt="Imagem de destaque"
                  className="w-full object-contain"
                  style={{ maxHeight: "220px" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Pencil size={14} /> Clique para trocar
                  </div>
                </div>
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
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <ImagePlus size={22} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 font-medium">
                  Arraste e solte uma imagem aqui
                </p>
                <p className="text-xs text-slate-400 mt-1 mb-3">ou</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); imageRef.current?.click(); }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2558] px-4 py-2 rounded-xl transition-colors"
                >
                  <ImageIcon size={14} /> Selecionar do computador
                </button>
                <p className="text-[11px] text-slate-400 mt-3">
                  JPG, PNG ou WebP · Recomendado: 1200×630px
                </p>
              </div>
            )}

            {/* URL input */}
            <div className="mt-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LinkIcon size={13} />
              </span>
              <input
                value={!form.imageUrl?.startsWith("data:") ? (form.imageUrl ?? "") : ""}
                onChange={(e) => setField("imageUrl", e.target.value)}
                placeholder="Ou cole uma URL de imagem"
                className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
          </div>

          {/* ── Content blocks ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66] mb-1">Blocos de conteúdo</h3>
            <p className="text-xs text-slate-400 mb-4">Adicione elementos para enriquecer sua matéria.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => { setGalleryImages([""]); setGalleryOpen(true); }}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-[#2563EB]/30 hover:bg-blue-50/50 cursor-pointer transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#EEF4FF] group-hover:bg-[#DBEAFE] transition-colors">
                  <GalleryHorizontal size={16} className="text-[#2563EB]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Adicionar galeria</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Galeria de imagens no corpo da matéria</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setInlineImgUrl(""); setInlineImgAlt(""); setInlineImgAlign("center"); setInlineImgOpen(true); }}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-emerald-400/30 hover:bg-emerald-50/50 cursor-pointer transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                  <ImagePlus size={16} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Imagem no texto</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Insira uma imagem inline no conteúdo</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setVideoUrl(""); setVideoOpen(true); }}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-[#E71D36]/30 hover:bg-red-50/50 cursor-pointer transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#FEE2E2] group-hover:bg-[#FECACA] transition-colors">
                  <Video size={16} className="text-[#E71D36]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Adicionar vídeo</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Incorpore um vídeo do YouTube ou Vimeo</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setCitationText(""); setCitationAuthor(""); setCitationOpen(true); }}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-[#0B2A66]/30 hover:bg-indigo-50/50 cursor-pointer transition-colors text-left group"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#EEF2FF] group-hover:bg-[#E0E7FF] transition-colors">
                  <Quote size={16} className="text-[#0B2A66]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Adicionar citação</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">Destaque citações importantes no texto</p>
                </div>
              </button>
            </div>

            {/* ── Gallery modal ──────────────────────────── */}
            {galleryOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] flex items-center justify-center">
                        <GalleryHorizontal size={15} className="text-[#2563EB]" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800">Adicionar galeria</h4>
                    </div>
                    <button type="button" onClick={() => setGalleryOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  {/* Hidden file input for gallery uploads */}
                  <input
                    ref={galleryFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleGalleryUploadFile(f, galleryUploadIdx);
                      e.target.value = "";
                    }}
                  />
                  <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
                    <p className="text-xs text-slate-500">Cole a URL ou faça upload de cada imagem da galeria.</p>
                    {galleryImages.map((img, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          {img.trim() && (
                            <img
                              src={img}
                              alt=""
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 object-cover rounded-lg border border-slate-100"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                          <input
                            value={img.startsWith("data:") ? "(imagem enviada)" : img}
                            onChange={(e) => {
                              const copy = [...galleryImages];
                              copy[i] = e.target.value;
                              setGalleryImages(copy);
                            }}
                            placeholder={`URL da imagem ${i + 1}`}
                            className={`w-full py-2.5 pr-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#2563EB] bg-slate-50 placeholder:text-slate-400 transition-colors ${img.trim() ? "pl-11" : "pl-4"}`}
                          />
                        </div>
                        {/* Upload button */}
                        <button
                          type="button"
                          title="Fazer upload de imagem"
                          onClick={() => { setGalleryUploadIdx(i); galleryFileRef.current?.click(); }}
                          className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-[#2563EB] hover:border-[#2563EB] transition-colors shrink-0"
                        >
                          <ImagePlus size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setGalleryImages((prev) => prev.filter((_, j) => j !== i))}
                          disabled={galleryImages.length === 1}
                          className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setGalleryImages((prev) => [...prev, ""])}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] hover:underline mt-1"
                    >
                      <Plus size={13} /> Adicionar mais imagens
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                    <button type="button" onClick={() => setGalleryOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={insertGallery}
                      disabled={!galleryImages.some((u) => u.trim())}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Inserir galeria
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Video modal ────────────────────────────── */}
            {videoOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                        <Play size={15} className="text-[#E71D36]" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800">Adicionar vídeo</h4>
                    </div>
                    <button type="button" onClick={() => setVideoOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <p className="text-xs text-slate-500">Cole o link do YouTube, Vimeo ou URL direta de vídeo.</p>
                    <div className="relative">
                      <Youtube size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#E71D36] bg-slate-50 placeholder:text-slate-400 transition-colors"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertVideo(); } }}
                        autoFocus
                      />
                    </div>
                    {videoUrl.trim() && (
                      <div className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                        {getYoutubeId(videoUrl) ? (
                          <span className="flex items-center gap-1 text-red-600 font-medium"><Youtube size={11} /> YouTube detectado</span>
                        ) : getVimeoId(videoUrl) ? (
                          <span className="flex items-center gap-1 text-blue-600 font-medium"><Play size={11} /> Vimeo detectado</span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-500"><Video size={11} /> Vídeo direto (MP4/WebM)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                    <button type="button" onClick={() => setVideoOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={insertVideo}
                      disabled={!videoUrl.trim()}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#E71D36] hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Inserir vídeo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Citation modal ─────────────────────────── */}
            {citationOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] flex items-center justify-center">
                        <Quote size={15} className="text-[#0B2A66]" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800">Adicionar citação</h4>
                    </div>
                    <button type="button" onClick={() => setCitationOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    {/* Live preview */}
                    {citationText.trim() && (
                      <div style={{ borderLeft: "4px solid #0B2A66", padding: "12px 16px", background: "#EEF2FF", borderRadius: "0 10px 10px 0", margin: "0 0 4px 0" }}>
                        <p style={{ fontStyle: "italic", color: "#1e3a8a", margin: 0, fontSize: "0.9em" }}>"{citationText}"</p>
                        {citationAuthor && <footer style={{ marginTop: 8, fontSize: "0.8em", color: "#64748b" }}>— {citationAuthor}</footer>}
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Texto da citação</label>
                      <textarea
                        value={citationText}
                        onChange={(e) => setCitationText(e.target.value)}
                        placeholder="Digite a citação aqui…"
                        rows={3}
                        autoFocus
                        className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">Autor <span className="font-normal text-slate-400">(opcional)</span></label>
                      <input
                        value={citationAuthor}
                        onChange={(e) => setCitationAuthor(e.target.value)}
                        placeholder="Ex: Presidente da República"
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                    <button type="button" onClick={() => setCitationOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={insertCitation}
                      disabled={!citationText.trim()}
                      className="px-4 py-2 text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2558] rounded-xl transition-colors disabled:opacity-50"
                    >
                      Inserir citação
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Inline image modal ─────────────────────────── */}
            {inlineImgOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <ImagePlus size={15} className="text-emerald-600" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800">Imagem no texto</h4>
                    </div>
                    <button type="button" onClick={() => setInlineImgOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={inlineImgFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInlineImgFile(f); e.target.value = ""; }}
                  />

                  <div className="px-6 py-5 space-y-4">
                    {/* Preview */}
                    {inlineImgUrl && (
                      <div className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50">
                        <img
                          src={inlineImgUrl}
                          alt={inlineImgAlt || "preview"}
                          className="w-full object-contain"
                          style={{ maxHeight: "180px" }}
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                        />
                      </div>
                    )}

                    {/* Upload or URL */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-2">Imagem</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => inlineImgFileRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shrink-0"
                        >
                          <ImagePlus size={13} /> Upload
                        </button>
                        <div className="relative flex-1">
                          <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            value={inlineImgUrl.startsWith("data:") ? "(imagem enviada)" : inlineImgUrl}
                            onChange={(e) => setInlineImgUrl(e.target.value)}
                            placeholder="Ou cole a URL da imagem"
                            autoFocus
                            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-slate-50 placeholder:text-slate-400 transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Alt text */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                        Legenda / alt text <span className="font-normal text-slate-400">(opcional)</span>
                      </label>
                      <input
                        value={inlineImgAlt}
                        onChange={(e) => setInlineImgAlt(e.target.value)}
                        placeholder="Ex: Cerimônia de posse na CLDF"
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-slate-50 placeholder:text-slate-400 transition-colors"
                      />
                    </div>

                    {/* Alignment */}
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-2">Alinhamento</label>
                      <div className="flex gap-2">
                        {(["left", "center", "right"] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setInlineImgAlign(a)}
                            className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                              inlineImgAlign === a
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "text-slate-600 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {a === "left" ? "Esquerda" : a === "center" ? "Centro" : "Direita"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
                    <button type="button" onClick={() => setInlineImgOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={insertInlineImage}
                      disabled={!inlineImgUrl.trim()}
                      className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Inserir imagem
                    </button>
                  </div>
                </div>
              </div>
            )}
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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0B2A66]">SEO / AIO / Palavras-chave</h3>
              <button
                type="button"
                onClick={() => { void triggerSeoFill(); }}
                disabled={fillingSeo || !form.title?.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-colors disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}
                title={!form.title?.trim() ? "Preencha o título primeiro" : "Preencher SEO, AIO e palavras-chave com IA"}
              >
                {fillingSeo
                  ? <><Loader2 size={11} className="animate-spin" /> Gerando…</>
                  : <><Zap size={11} /> Gerar com IA</>
                }
              </button>
            </div>

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
                Meta descrição / AIO {aiFilledFields.has("metaDesc") && <AiBadge />}
              </label>
              <textarea
                value={seoDesc}
                onChange={(e) => { userEditedRef.current.add("metaDesc"); setSeoDesc(e.target.value.slice(0, 160)); }}
                placeholder="Descrição otimizada para buscadores e IA (AIO)"
                rows={3}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("metaDesc") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{seoDesc.length}/160</p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Palavras-chave {aiFilledFields.has("summary") && <AiBadge />}
              </label>
              <textarea
                value={form.keywords ?? ""}
                onChange={(e) => { userEditedRef.current.add("summary"); setField("keywords", e.target.value); }}
                placeholder="Ex: turismo, São Paulo, economia, desenvolvimento"
                rows={2}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("summary") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Separe por vírgula · a IA preenche automaticamente</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Paste text modal ══════════════════════════════════════════ */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh", boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <ClipboardPaste size={16} className="text-[#2563EB]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Colar texto formatado</h4>
                  <p className="text-[11px] text-slate-400">Cole texto de qualquer fonte — formatamos os parágrafos automaticamente</p>
                </div>
              </div>
              <button type="button" onClick={() => setPasteOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
              <textarea
                value={pasteRaw}
                onChange={(e) => setPasteRaw(e.target.value)}
                placeholder="Cole o texto aqui (de Word, Google Docs, site, e-mail…)"
                autoFocus
                className="w-full h-56 px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#2563EB] bg-slate-50 placeholder:text-slate-400 resize-none leading-relaxed transition-colors"
              />

              {/* Live preview */}
              {pasteRaw.trim() && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Pré-visualização formatada</p>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed max-h-44 overflow-y-auto space-y-3 whitespace-pre-wrap font-sans">
                    {formatParagraphText(pasteRaw).split("\n\n").map((p, i) =>
                      p.startsWith("## ")
                        ? <p key={i} className="font-bold text-[#0B2A66] text-base">{p.slice(3)}</p>
                        : p.startsWith("- ")
                        ? <p key={i} className="pl-3 border-l-2 border-slate-300 text-slate-600">{p.slice(2)}</p>
                        : <p key={i}>{p}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex gap-3">
                {(["replace", "append"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPasteMode(m)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      pasteMode === m
                        ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {m === "replace" ? "⟲ Substituir conteúdo atual" : "＋ Adicionar ao final"}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0">
              <p className="text-[11px] text-slate-400">
                {pasteRaw.trim()
                  ? `${formatParagraphText(pasteRaw).split("\n\n").length} parágrafos detectados`
                  : "Aguardando texto…"}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPasteOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePasteInsert}
                  disabled={!pasteRaw.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
                >
                  Formatar e inserir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
