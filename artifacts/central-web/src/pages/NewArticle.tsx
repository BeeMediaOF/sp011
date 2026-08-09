import { useEffect, useMemo, useRef, useState } from "react";
import {
  Save, Send, Eye, ChevronDown, ChevronRight,
  Image as ImageIcon, X, CheckCircle, Loader2,
  Link as LinkIcon, Quote, Video,
  ImagePlus, GalleryHorizontal, AlertCircle, Wand2, Plus, Trash2,
  Youtube, Play, RefreshCw, Pencil, Zap, Globe,
} from "lucide-react";
import RichTextEditor from "../components/RichTextEditor";
import { api, apiUpload } from "../api";
import { sanitizeHtml } from "../lib/sanitize";
import {
  buildVideoEmbed, buildGalleryBlock, buildCitationBlock, buildInlineImage,
  getYoutubeId, getVimeoId,
} from "../lib/articleEmbeds";
import { statusLabel, useLoad } from "../hooks";

/**
 * Editor "Nova notícia" — réplica do Novo Artigo do admin dos blogs
 * (brasilia-agora/pages/admin/ArticleEdit.tsx), adaptado à central:
 * a notícia é escrita UMA vez e publicada em N blogs (deliveryWorker →
 * ingest HMAC). Rascunho fica na central (news_items 'manual_draft') e é
 * reaberto por /nova-noticia?id=…; agendamento segura as entregas até a hora.
 */

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

interface BlogLite {
  id: string;
  name: string;
  isActive: boolean;
  language: string;
  categories?: Array<{ slug: string; hint?: string }> | null;
}

interface ManualResult {
  id: string;
  rewriteId: string;
  deliveries: Array<{ id: string; blogId: string; blogName: string; status: string }>;
}

interface AiFill {
  subtitle: string;
  summary: string;
  tags: string[];
  seoTitle: string;
  metaDesc: string;
  slug: string;
}

interface RewriteLite {
  id: string;
  blogId: string | null;
  language: string | null;
  title: string | null;
  subtitle: string | null;
  contentHtml: string | null;
  slug: string | null;
  keywords: string | null;
  socialTitle: string | null;
  socialSummary: string | null;
}

interface NewsDetail {
  id: string;
  title: string;
  description: string | null;
  contentRaw: string | null;
  imageUrl: string | null;
  author: string | null;
  imageCredit: string | null;
  canonicalUrl: string | null;
  category: string;
  status: string;
  rewrites: RewriteLite[];
}

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

// ── Formatação de texto colado (port do blog + saída em HTML p/ o TipTap) ────

function toTitleCase(s: string) {
  const lower = ["de", "do", "da", "dos", "das", "e", "em", "o", "a", "os", "as", "com", "por", "para", "ao", "aos"];
  return s.toLowerCase().replace(/\b\w+/g, (w, i) =>
    i === 0 || !lower.includes(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w,
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

    const noAccents = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isAllCaps = /^[A-Z0-9\s:\u2013\u2014.,'"\u201C\u201D]{3,}$/.test(noAccents) && !/[a-z]/.test(noAccents) && text.length <= 80;
    if (isAllCaps) { paras.push(`## ${toTitleCase(text)}`); return; }

    const numberedCaps = text.match(/^(\d+\.|[IVX]+\.)\s+(.+)$/);
    if (numberedCaps && !/[a-z]/.test(numberedCaps[2]!)) {
      paras.push(`## ${toTitleCase(numberedCaps[2]!)}`); return;
    }

    if (/^[-\u2022\u00B7*]\s/.test(text)) { paras.push(`- ${text.slice(2).trim()}`); return; }

    paras.push(text);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); } else { current.push(trimmed); }
  }
  flush();
  return paras.join("\n\n");
}

/** Converte a saída do formatador (##/-/texto) em HTML que o TipTap entende. */
function mdishToHtml(s: string): string {
  return s.split(/\n\n+/).map((p) => {
    const block = p.trim();
    if (!block) return "";
    if (block.startsWith("### ")) return `<h3>${block.slice(4)}</h3>`;
    if (block.startsWith("## ")) return `<h2>${block.slice(3)}</h2>`;
    if (block.startsWith("> ")) return `<blockquote><p>${block.slice(2)}</p></blockquote>`;
    if (/^- /m.test(block)) {
      const items = block.split(/\n/).filter(Boolean)
        .map((l) => `<li>${l.replace(/^- /, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).filter(Boolean).join("\n");
}

/** HTML → texto com quebras (para o "Formatar" reprocessar conteúdo colado). */
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return doc.body.textContent ?? "";
}

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export default function NewArticle() {
  const { data: blogsData } = useLoad(() => api<BlogLite[]>("/blogs"));
  const activeBlogs = useMemo(() => (blogsData ?? []).filter((b) => b.isActive), [blogsData]);

  // Rascunho aberto por /nova-noticia?id=…
  const [editId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("id"));
  const [draftId, setDraftId] = useState<string | null>(editId);
  const [loading, setLoading] = useState(!!editId);
  const [published, setPublished] = useState(false);

  // ── Campos (espelho do blog) ──
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [imageCredit, setImageCredit] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [category, setCategory] = useState("");
  const [slug, setSlug] = useState("");
  const [keywords, setKeywords] = useState(""); // Resumo / palavras-chave
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [socialTitle, setSocialTitle] = useState("");
  const [socialSummary, setSocialSummary] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [fillingSeo, setFillingSeo] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [result, setResult] = useState<ManualResult | null>(null);

  // ── Modais ──
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteRaw, setPasteRaw] = useState("");
  const [pasteMode, setPasteMode] = useState<"replace" | "append">("replace");
  const [previewOpen, setPreviewOpen] = useState(false);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([""]);
  const [galleryUploadIdx, setGalleryUploadIdx] = useState(0);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  const [citationOpen, setCitationOpen] = useState(false);
  const [citationText, setCitationText] = useState("");
  const [citationAuthor, setCitationAuthor] = useState("");

  const [inlineImgOpen, setInlineImgOpen] = useState(false);
  const [inlineImgUrl, setInlineImgUrl] = useState("");
  const [inlineImgAlt, setInlineImgAlt] = useState("");
  const [inlineImgAlign, setInlineImgAlign] = useState<"left" | "center" | "right">("center");
  const [inlineImgUploading, setInlineImgUploading] = useState(false);

  const imageRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const inlineImgFileRef = useRef<HTMLInputElement>(null);
  const userEditedRef = useRef<Set<string>>(new Set());

  // Slug automático a partir do título (enquanto não editado à mão)
  useEffect(() => {
    if (!userEditedRef.current.has("slug") && !published) setSlug(slugify(title));
  }, [title, published]);

  // Carrega rascunho/notícia manual existente
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    api<NewsDetail>(`/news/${editId}`)
      .then((d) => {
        const rw = d.rewrites.find((r) => r.blogId === null) ?? d.rewrites[0];
        setTitle(rw?.title ?? d.title ?? "");
        setSubtitle(rw?.subtitle ?? d.description ?? "");
        setContent(rw?.contentHtml ?? d.contentRaw ?? "");
        setImageUrl(d.imageUrl ?? "");
        setAuthor(d.author ?? "");
        setImageCredit(d.imageCredit ?? "");
        setCanonicalUrl(d.canonicalUrl ?? "");
        setCategory(d.category && d.category !== "geral" ? d.category : "");
        setSlug(rw?.slug ?? "");
        if (rw?.slug) userEditedRef.current.add("slug");
        setKeywords(rw?.keywords ?? "");
        setSocialTitle(rw?.socialTitle ?? "");
        setSocialSummary(rw?.socialSummary ?? "");
        setLanguage(rw?.language === "en" ? "en" : "pt-BR");
        if (d.status !== "manual_draft") { setPublished(true); setStatus("published"); }
      })
      .catch(() => setError("Notícia não encontrada"))
      .finally(() => setLoading(false));
  }, [editId]);

  // ── Categorias: união das taxonomias dos blogs ativos ──
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of activeBlogs) for (const c of b.categories ?? []) set.add(c.slug);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [activeBlogs]);

  const allSelected = activeBlogs.length > 0 && activeBlogs.every((b) => selected.has(b.id));
  const toggleBlog = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Upload da imagem de destaque ──
  async function handleImageFile(file: File) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError("Formato não suportado — use JPEG, PNG, WebP ou GIF.");
      return;
    }
    setUploadingImage(true);
    setError("");
    try {
      const { url } = await apiUpload<{ url: string }>("/news/upload-image", file);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload da imagem");
    } finally {
      setUploadingImage(false);
    }
  }

  function addTag(v: string) {
    const t = v.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  // ── Blocos de conteúdo (inserem HTML no editor) ──
  function appendToContent(block: string) {
    setContent((current) => (current.trim() ? `${current}\n${block}` : block));
  }

  function insertGallery() {
    const block = buildGalleryBlock(galleryImages);
    if (!block) return;
    appendToContent(block);
    setGalleryOpen(false);
    setGalleryImages([""]);
  }

  function insertVideo() {
    const embed = buildVideoEmbed(videoUrl);
    if (!embed) return;
    appendToContent(embed);
    setVideoOpen(false);
    setVideoUrl("");
  }

  function insertCitation() {
    const block = buildCitationBlock(citationText, citationAuthor);
    if (!block) return;
    appendToContent(block);
    setCitationOpen(false);
    setCitationText("");
    setCitationAuthor("");
  }

  function insertInlineImage() {
    const block = buildInlineImage(inlineImgUrl, inlineImgAlt, inlineImgAlign);
    if (!block) return;
    appendToContent(block);
    setInlineImgOpen(false);
    setInlineImgUrl("");
    setInlineImgAlt("");
    setInlineImgAlign("center");
  }

  async function uploadInlineImg(file: File) {
    setInlineImgUploading(true);
    try {
      const { url } = await apiUpload<{ url: string }>("/news/upload-image", file);
      setInlineImgUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setInlineImgUploading(false);
    }
  }

  async function uploadGalleryImg(file: File, idx: number) {
    setGalleryUploading(true);
    try {
      const { url } = await apiUpload<{ url: string }>("/news/upload-image", file);
      setGalleryImages((prev) => prev.map((v, i) => (i === idx ? url : v)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setGalleryUploading(false);
    }
  }

  // ── Colar texto / Formatar ──
  function handlePasteInsert() {
    const formatted = mdishToHtml(formatParagraphText(pasteRaw));
    if (!formatted) return;
    if (pasteMode === "replace") setContent(formatted);
    else setContent((c) => (c.trim() ? `${c}\n${formatted}` : formatted));
    setPasteOpen(false);
    setPasteRaw("");
  }

  function handleFormatContent() {
    if (!content.trim()) return;
    setContent(mdishToHtml(formatParagraphText(htmlToPlainText(content))));
  }

  // ── SEO com IA (botão — na central o provider é o mesmo do pipeline) ──
  async function triggerSeoFill() {
    if (!title.trim()) return;
    setFillingSeo(true);
    setError("");
    try {
      const ai = await api<AiFill>("/news/manual/autofill", {
        method: "POST",
        body: { title: title.trim(), content },
      });
      const filled = new Set(aiFilledFields);
      if (ai.subtitle && !subtitle.trim()) { setSubtitle(ai.subtitle); filled.add("subtitle"); }
      if (ai.summary && !keywords.trim()) { setKeywords(ai.summary); filled.add("summary"); }
      if (ai.tags.length > 0 && tags.length === 0) { setTags(ai.tags); filled.add("tags"); }
      if (ai.seoTitle) { setSeoTitle(ai.seoTitle.slice(0, 60)); filled.add("seoTitle"); }
      if (ai.metaDesc) { setSeoDesc(ai.metaDesc.slice(0, 160)); filled.add("metaDesc"); }
      if (ai.slug && !userEditedRef.current.has("slug")) { setSlug(ai.slug.slice(0, 80)); filled.add("slug"); }
      setAiFilledFields(filled);
      setSuccess("SEO / AIO preenchido com IA!");
      setTimeout(() => setSuccess(""), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao preencher SEO com IA");
      setTimeout(() => setError(""), 4000);
    } finally {
      setFillingSeo(false);
    }
  }

  // ── Salvar / publicar ──
  async function handleSave(intent: "draft" | "publish") {
    setError("");
    setSuccess("");
    if (!title.trim()) { setError("O título é obrigatório"); return; }
    if (intent === "publish" && selected.size === 0) {
      setError("Selecione pelo menos um blog de destino.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        status: intent,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        contentHtml: content,
        imageUrl: imageUrl.trim() || undefined,
        author: author.trim() || undefined,
        imageCredit: imageCredit.trim() || undefined,
        canonicalUrl: canonicalUrl.trim() || undefined,
        category: category || "geral",
        targetCategory: category || undefined,
        language,
        slug: slug.trim() || slugify(title),
        keywords: keywords.trim() || tags.join(", ") || undefined,
        socialTitle: socialTitle.trim() || undefined,
        socialSummary: socialSummary.trim() || undefined,
        scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
        blogIds: [...selected],
      };
      const res = draftId
        ? await api<ManualResult>(`/news/manual/${draftId}`, { method: "PUT", body })
        : await api<ManualResult>("/news/manual", { method: "POST", body });

      if (!draftId) {
        setDraftId(res.id);
        window.history.replaceState(null, "", `/nova-noticia?id=${res.id}`);
      }
      if (intent === "publish") {
        setPublished(true);
        setStatus("published");
        setResult(res);
        setSuccess(scheduleAt ? "Notícia agendada!" : "Notícia publicada!");
        window.scrollTo(0, 0);
      } else {
        setSuccess("Rascunho salvo");
        setTimeout(() => setSuccess(""), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ── Topbar / breadcrumb ──
  const breadcrumb = (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
      <span className="hover:text-[#0B2A66] cursor-pointer" onClick={() => { window.location.href = "/"; }}>Dashboard</span>
      <ChevronRight size={11} />
      <span className="hover:text-[#0B2A66] cursor-pointer" onClick={() => { window.location.href = "/noticias"; }}>Notícias</span>
      <ChevronRight size={11} />
      <span className="text-slate-600 font-medium">{draftId ? "Editar notícia" : "Nova notícia"}</span>
    </div>
  );

  const topbarActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {fillingSeo && (
        <span className="text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 bg-purple-50 text-purple-600">
          <Loader2 size={12} className="animate-spin" /> Preenchendo com IA…
        </span>
      )}
      {!fillingSeo && aiFilledFields.size > 0 && !error && !success && (
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
        disabled={saving || published}
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <Save size={14} /> Salvar rascunho
      </button>
      <button
        onClick={() => setPreviewOpen(true)}
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <Eye size={14} /> Pré-visualizar
      </button>
      {published ? (
        <button
          onClick={() => { window.location.href = "/nova-noticia"; }}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white transition-colors"
          style={{ background: "#0B2A66", boxShadow: CARD_SHADOW }}
        >
          <Plus size={14} /> Nova notícia
        </button>
      ) : (
        <div className="flex rounded-xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>
          <button
            onClick={() => { void handleSave("publish"); }}
            disabled={saving}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 text-white transition-colors disabled:opacity-60"
            style={{ background: "#E71D36" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {saving ? "Salvando…" : scheduleAt ? "Agendar" : `Publicar em ${selected.size} blog(s)`}
          </button>
          <button className="px-2.5 py-2 border-l border-red-700 text-white hover:bg-red-700 transition-colors" style={{ background: "#E71D36" }}>
            <ChevronDown size={13} />
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="tw-page flex items-center justify-center h-64 text-slate-400 gap-3">
        <Loader2 size={20} className="animate-spin" /> Carregando notícia…
      </div>
    );
  }

  return (
    <div className="tw-page">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        {breadcrumb}
        {topbarActions}
      </div>

      {result && (
        <div className="bg-white rounded-2xl p-5 mb-5" style={{ boxShadow: CARD_SHADOW }}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0B2A66] mt-0 mb-2">
            <CheckCircle size={16} className="text-green-600" />
            Notícia {scheduleAt ? "agendada" : "publicada"} — {result.deliveries.length} entrega(s) na fila
          </h3>
          <ul className="text-sm text-slate-600 pl-5 list-disc space-y-0.5">
            {result.deliveries.map((d) => (
              <li key={d.id}>
                <b>{d.blogName}</b>: {statusLabel(d.status)}
                {d.status === "awaiting_localization" && " (tradução/categoria automática antes do envio)"}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-2 mb-0">
            Acompanhe (e use "Publicar agora", se quiser adiantar) na aba <b>Entregas</b>.
            Edições feitas agora não são reenviadas aos blogs.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">

        {/* ══ Coluna esquerda ══════════════════════════════════════ */}
        <div className="space-y-5">

          {/* ── Campos principais ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: CARD_SHADOW }}>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Título da matéria <span className="text-[#E71D36]">*</span>
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Subtítulo {aiFilledFields.has("subtitle") && <AiBadge />}
              </label>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Digite o subtítulo da matéria (opcional)"
                className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors ${
                  aiFilledFields.has("subtitle") ? "border-purple-200" : "border-slate-200"
                }`}
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Resumo {aiFilledFields.has("summary") && <AiBadge />}
              </label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Breve descrição ou destaque da matéria"
                rows={3}
                maxLength={160}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("summary") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{keywords.length}/160</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Conteúdo <span className="text-[#E71D36]">*</span>
              </label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                onPasteClick={() => { setPasteRaw(""); setPasteOpen(true); }}
                onFormatClick={handleFormatContent}
                onUploadFile={async (file) => {
                  if (!file.type.startsWith("image/")) {
                    throw new Error("Só imagens aqui — para vídeo use o botão do YouTube/Vimeo.");
                  }
                  const res = await apiUpload<{ url: string }>("/news/upload-image", file);
                  return { url: res.url, mediaType: "image" as const };
                }}
              />
            </div>
          </div>

          {/* ── Imagem de destaque ─────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-semibold text-slate-600">
                Imagem de destaque <span className="text-[#E71D36]">*</span>
              </label>
              {imageUrl && (
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
                    onClick={() => setImageUrl("")}
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
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageFile(f); e.target.value = ""; }}
            />

            {uploadingImage ? (
              <div className="border-2 border-dashed border-[#0B2A66] bg-[#EEF2FF] rounded-xl p-10 text-center">
                <Loader2 size={28} className="animate-spin text-[#0B2A66] mx-auto mb-3" />
                <p className="text-sm text-[#0B2A66] font-medium">Enviando imagem…</p>
              </div>
            ) : imageUrl ? (
              <div
                className="group relative rounded-xl overflow-hidden border border-slate-100 cursor-pointer bg-slate-100"
                onClick={() => imageRef.current?.click()}
              >
                <img
                  src={imageUrl}
                  alt="Imagem de destaque"
                  className="w-full object-contain"
                  style={{ maxHeight: "220px" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Pencil size={14} /> Clique para trocar
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f && f.type.startsWith("image/")) void handleImageFile(f);
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
                  JPG, PNG, WebP, GIF · Recomendado: 1200×630px · Máx: 10 MB
                </p>
              </div>
            )}

            <div className="mt-3 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LinkIcon size={13} />
              </span>
              <input
                value={imageUrl.startsWith("data:") ? "" : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Ou cole uma URL de imagem"
                className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
          </div>

          {/* ── Blocos de conteúdo ─────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66] mb-1 mt-0">Blocos de conteúdo</h3>
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
          </div>
        </div>

        {/* ══ Sidebar direita ════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* ── Publicação ─────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66] mt-0 mb-0">Publicação</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Status <span className="text-[#E71D36]">*</span>
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                  disabled={published}
                  className="w-full pl-8 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                  style={{ background: status === "published" ? "#16A34A" : "#F59E0B" }}
                />
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Agendamento</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 text-slate-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">Deixe em branco para publicar imediatamente</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Idioma do texto</label>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="pt-BR">Português (BR)</option>
                  <option value="en">Inglês</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Blog em outro idioma recebe a versão traduzida automaticamente</p>
            </div>
          </div>

          {/* ── Blogs de destino (específico da central) ───── */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#0B2A66] mt-0 mb-3">
              <Globe size={14} /> Blogs de destino <span className="text-[#E71D36]">*</span>
            </h3>
            {activeBlogs.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum blog ativo cadastrado.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(activeBlogs.map((b) => b.id)))}
                  />
                  Selecionar todos ({activeBlogs.length})
                </label>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {activeBlogs.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm text-slate-700 border border-slate-100 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleBlog(b.id)} />
                      <span className="flex-1 min-w-0 truncate">{b.name}</span>
                      {b.language === "en" && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">EN</span>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Metadados ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Categoria <span className="text-[#E71D36]">*</span>
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 appearance-none cursor-pointer text-slate-700"
                >
                  <option value="">Automática (IA classifica em cada blog)</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {category && !categoryOptions.includes(category) && (
                    <option value={category}>{category}</option>
                  )}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Aplicada em todos os blogs selecionados. Vazio = a IA classifica no menu de cada blog.
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
                Tags {aiFilledFields.has("tags") && <AiBadge />}
              </label>
              <div className={`border rounded-xl bg-slate-50 px-3 py-2 focus-within:border-[#0B2A66] transition-colors ${
                aiFilledFields.has("tags") ? "border-purple-200" : "border-slate-200"
              }`}>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 text-[11px] font-semibold text-[#0B2A66] bg-[#EEF2FF] px-2 py-0.5 rounded-full">
                        {t}
                        <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder={tags.length ? "" : "Digite e pressione Enter para adicionar"}
                  className="text-sm bg-transparent outline-none w-full placeholder:text-slate-400"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Separe as tags com Enter</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Autor <span className="text-[#E71D36]">*</span>
              </label>
              <input
                list="author-suggestions"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="ex.: Por BeeSports"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 text-slate-700"
              />
              <datalist id="author-suggestions">
                <option value="Por BeeSports" />
                <option value="Redação" />
                <option value="Colunista" />
              </datalist>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Assinatura exibida nos blogs. Vazio = assinatura padrão de cada blog.
              </p>
            </div>

            <div className="pt-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Crédito da foto</label>
              <input
                type="text"
                value={imageCredit}
                onChange={(e) => setImageCredit(e.target.value)}
                placeholder="Ex.: Reprodução/Instagram"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 text-slate-700"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                "Foto: crédito" discreto sob a imagem principal; a exibição segue o padrão de cada blog.
              </p>
            </div>
          </div>

          {/* ── SEO ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0B2A66] mt-0 mb-0">SEO / AIO / Palavras-chave</h3>
              <button
                type="button"
                onClick={() => { void triggerSeoFill(); }}
                disabled={fillingSeo || !title.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-colors disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}
                title={!title.trim() ? "Preencha o título primeiro" : "Preencher SEO, AIO e palavras-chave com IA"}
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
                onChange={(e) => setSeoTitle(e.target.value.slice(0, 60))}
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
                onChange={(e) => setSeoDesc(e.target.value.slice(0, 160))}
                placeholder="Descrição otimizada para buscadores e IA (AIO)"
                rows={3}
                className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 resize-none transition-colors ${
                  aiFilledFields.has("metaDesc") ? "border-purple-200" : "border-slate-200"
                }`}
              />
              <p className="text-[10px] text-slate-400 text-right mt-0.5">{seoDesc.length}/160</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">URL Canônica</label>
              <input
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                placeholder="https://… (opcional)"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
          </div>

          {/* ── Redes sociais (arte do Instagram) ────────────── */}
          <div className="bg-white rounded-2xl p-5 space-y-4" style={{ boxShadow: CARD_SHADOW }}>
            <h3 className="text-sm font-semibold text-[#0B2A66] mt-0 mb-0">Redes sociais</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Manchete social (arte do Instagram)</label>
              <input
                value={socialTitle}
                onChange={(e) => setSocialTitle(e.target.value)}
                maxLength={90}
                placeholder="Opcional — 70 a 85 caracteres"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resumo social (legenda)</label>
              <input
                value={socialSummary}
                onChange={(e) => setSocialSummary(e.target.value)}
                maxLength={250}
                placeholder="Opcional"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: colar texto ──────────────────────────────── */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h4 className="text-sm font-semibold text-slate-800 m-0">Colar texto formatado</h4>
              <button type="button" onClick={() => setPasteOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-500 m-0">
                Cole o texto bruto — títulos em MAIÚSCULAS viram subtítulos e os parágrafos são separados automaticamente.
              </p>
              <textarea
                value={pasteRaw}
                onChange={(e) => setPasteRaw(e.target.value)}
                rows={10}
                autoFocus
                placeholder="Cole o texto aqui…"
                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#0B2A66] bg-slate-50 placeholder:text-slate-400 transition-colors"
              />
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="radio" checked={pasteMode === "replace"} onChange={() => setPasteMode("replace")} />
                  Substituir conteúdo
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="radio" checked={pasteMode === "append"} onChange={() => setPasteMode("append")} />
                  Adicionar ao final
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button type="button" onClick={() => setPasteOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePasteInsert}
                disabled={!pasteRaw.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#0B2A66] hover:bg-[#0a2558] rounded-xl transition-colors disabled:opacity-50"
              >
                Inserir texto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: galeria ──────────────────────────────────── */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] flex items-center justify-center">
                  <GalleryHorizontal size={15} className="text-[#2563EB]" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 m-0">Adicionar galeria</h4>
              </div>
              <button type="button" onClick={() => setGalleryOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <input
              ref={galleryFileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadGalleryImg(f, galleryUploadIdx);
                e.target.value = "";
              }}
            />
            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500 m-0">Cole a URL ou faça upload de cada imagem da galeria.</p>
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
                      value={img}
                      onChange={(e) => {
                        const copy = [...galleryImages];
                        copy[i] = e.target.value;
                        setGalleryImages(copy);
                      }}
                      placeholder={`URL da imagem ${i + 1}`}
                      className={`w-full py-2.5 pr-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-[#2563EB] bg-slate-50 placeholder:text-slate-400 transition-colors ${img.trim() ? "pl-11" : "pl-4"}`}
                    />
                  </div>
                  <button
                    type="button"
                    title="Fazer upload de imagem"
                    disabled={galleryUploading}
                    onClick={() => { setGalleryUploadIdx(i); galleryFileRef.current?.click(); }}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-[#2563EB] hover:border-[#2563EB] transition-colors shrink-0 disabled:opacity-50"
                  >
                    {galleryUploading && galleryUploadIdx === i ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
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

      {/* ── Modal: vídeo ────────────────────────────────────── */}
      {videoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-md" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                  <Play size={15} className="text-[#E71D36]" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 m-0">Adicionar vídeo</h4>
              </div>
              <button type="button" onClick={() => setVideoOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-500 m-0">Cole o link do YouTube, Vimeo ou URL direta de vídeo.</p>
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

      {/* ── Modal: citação ──────────────────────────────────── */}
      {citationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-md" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] flex items-center justify-center">
                  <Quote size={15} className="text-[#0B2A66]" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 m-0">Adicionar citação</h4>
              </div>
              <button type="button" onClick={() => setCitationOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
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

      {/* ── Modal: imagem no texto ──────────────────────────── */}
      {inlineImgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <ImagePlus size={15} className="text-emerald-600" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 m-0">Imagem no texto</h4>
              </div>
              <button type="button" onClick={() => setInlineImgOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <input
              ref={inlineImgFileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadInlineImg(f); e.target.value = ""; }}
            />

            <div className="px-6 py-5 space-y-4">
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

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Imagem</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={inlineImgUploading}
                    onClick={() => inlineImgFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors shrink-0 disabled:opacity-50"
                  >
                    {inlineImgUploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Upload
                  </button>
                  <div className="relative flex-1">
                    <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={inlineImgUrl}
                      onChange={(e) => setInlineImgUrl(e.target.value)}
                      placeholder="Ou cole a URL da imagem"
                      autoFocus
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-slate-50 placeholder:text-slate-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Legenda / alt text <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  value={inlineImgAlt}
                  onChange={(e) => setInlineImgAlt(e.target.value)}
                  placeholder="Ex: Cerimônia de posse"
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-slate-50 placeholder:text-slate-400 transition-colors"
                />
              </div>

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

      {/* ── Modal: pré-visualização ─────────────────────────── */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-6" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800 m-0">
                <Eye size={15} /> Pré-visualização
              </h4>
              <button type="button" onClick={() => setPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-8 py-6">
              {imageUrl && (
                <img src={imageUrl} alt="" className="w-full rounded-xl mb-1 object-cover" style={{ maxHeight: 360 }} />
              )}
              {imageUrl && imageCredit && (
                <p className="text-[11px] text-slate-400 mb-4">Foto: {imageCredit}</p>
              )}
              <h1 className="text-2xl font-extrabold text-slate-900 leading-snug mb-2 mt-2">{title || "(sem título)"}</h1>
              {subtitle && <p className="text-[15px] text-slate-500 border-l-4 border-slate-200 pl-3 mb-3">{subtitle}</p>}
              <p className="text-xs text-slate-400 mb-5">
                {author || "Assinatura padrão de cada blog"} · {new Date().toLocaleDateString("pt-BR")}
              </p>
              <div
                className="prose-editor text-[15px] leading-relaxed text-slate-800 [&_p]:mb-3 [&_h2]:font-bold [&_h2]:text-lg [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_img]:rounded-xl [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) || "<p>(sem conteúdo)</p>" }}
              />
            </div>
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100">
              <button type="button" onClick={() => setPreviewOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
