import React, { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import { Save, Send, ArrowLeft, Monitor, Smartphone, Image, X, CheckCircle } from "lucide-react";

const CATEGORIES = [
  { value: "politica",   label: "Política" },
  { value: "cidade",     label: "Cidade" },
  { value: "seguranca",  label: "Segurança" },
  { value: "transporte", label: "Transporte" },
  { value: "saude",      label: "Saúde" },
  { value: "educacao",   label: "Educação" },
  { value: "cultura",    label: "Cultura" },
  { value: "esportes",   label: "Esportes" },
  { value: "colunas",    label: "Colunas" },
  { value: "brasil",     label: "Brasil" },
  { value: "mundo",      label: "Mundo" },
  { value: "economia",   label: "Economia" },
  { value: "tecnologia", label: "Tecnologia" },
  { value: "geral",      label: "Geral" },
];

const TAG_MAP: Record<string, string> = {
  politica:"POLÍTICA", cidade:"CIDADE", seguranca:"SEGURANÇA",
  transporte:"TRANSPORTE", saude:"SAÚDE", educacao:"EDUCAÇÃO",
  cultura:"CULTURA", esportes:"ESPORTES", colunas:"COLUNAS",
  brasil:"BRASIL", mundo:"MUNDO", economia:"ECONOMIA",
  tecnologia:"TECNOLOGIA", geral:"GERAL",
};

const empty: Partial<Article> = {
  title: "", subtitle: "", content: "", category: "geral",
  tag: "GERAL", imageUrl: "", author: "Redação", status: "draft",
};

type Preview = "desktop" | "mobile";

export default function ArticleEdit() {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/admin/artigos/:id");
  const isNew       = !matchEdit || paramsEdit?.id === "novo";
  const articleId   = isNew ? null : (paramsEdit?.id ?? null);

  const [form, setForm]         = useState<Partial<Article>>(empty);
  const [loading, setLoading]   = useState(!isNew);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [preview, setPreview]   = useState<Preview>("desktop");
  const [showPreview, setShowPreview] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isNew && articleId) {
      setLoading(true);
      adminApi.getArticle(articleId)
        .then((r) => setForm(r.article))
        .catch(() => setError("Artigo não encontrado"))
        .finally(() => setLoading(false));
    }
  }, [articleId, isNew]);

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

  const isPublished = form.status === "published";

  async function handleSave(intent: "draft" | "publish" | "update") {
    setError(""); setSuccess("");
    if (!form.title?.trim()) { setError("O título é obrigatório"); return; }
    setSaving(true);

    try {
      // Determine status to send
      let newStatus: "draft" | "published" = form.status ?? "draft";
      if (intent === "draft")   newStatus = "draft";
      if (intent === "publish") newStatus = "published";
      // intent === "update" keeps current status

      const data: Partial<Article> = { ...form, status: newStatus };

      if (isNew) {
        const { article } = await adminApi.createArticle(data);
        setSuccess(newStatus === "published" ? "Artigo publicado!" : "Rascunho salvo!");
        setTimeout(() => navigate(`/admin/artigos/${article.id}`), 800);
      } else {
        const { article } = await adminApi.updateArticle(articleId!, data);
        // If we want to publish and it wasn't published yet, call publish endpoint
        if (intent === "publish" && article.status !== "published") {
          const { article: pub } = await adminApi.publishArticle(article.id);
          setForm(pub);
        } else {
          setForm(article);
        }
        const msg = intent === "publish" ? "✓ Publicado!" :
                    intent === "draft"   ? "✓ Salvo como rascunho" :
                                          "✓ Alterações salvas";
        setSuccess(msg);
        setTimeout(() => setSuccess(""), 2500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title={isNew ? "Novo Artigo" : "Editar Artigo"}>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Back */}
        <button
          onClick={() => navigate("/admin/artigos")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para artigos
        </button>

        {loading ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">Carregando…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* ── Main form ── */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Título *</label>
                  <input
                    value={form.title ?? ""}
                    onChange={(e) => setField("title", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] font-semibold"
                    placeholder="Título principal do artigo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Subtítulo / Lide</label>
                  <input
                    value={form.subtitle ?? ""}
                    onChange={(e) => setField("subtitle", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Resumo de 1-2 frases que aparece abaixo do título"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Conteúdo</label>
                  <textarea
                    value={form.content ?? ""}
                    onChange={(e) => setField("content", e.target.value)}
                    rows={16}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] resize-y leading-relaxed"
                    placeholder="Texto completo do artigo. Use linhas em branco para separar parágrafos."
                  />
                  <p className="text-[11px] text-gray-400 mt-1 text-right">
                    {(form.content ?? "").length} caracteres
                  </p>
                </div>
              </div>

              {/* Image */}
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Image size={15} className="text-[#1a2448]" />
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Imagem de capa</h3>
                </div>

                {/* URL input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">URL da imagem</label>
                  <input
                    value={!form.imageUrl?.startsWith("data:") ? (form.imageUrl ?? "") : ""}
                    onChange={(e) => setField("imageUrl", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="https://exemplo.com/imagem.jpg"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="flex-1 border-t border-gray-200" />
                  <span>ou</span>
                  <span className="flex-1 border-t border-gray-200" />
                </div>

                {/* File upload */}
                <div>
                  <input
                    ref={imageRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                  />
                  <button
                    type="button"
                    onClick={() => imageRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Upload de imagem do computador
                  </button>
                </div>

                {/* Preview */}
                {form.imageUrl && (
                  <div className="relative inline-block">
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      className="h-40 w-full object-cover rounded-lg border border-gray-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                    />
                    <button
                      type="button"
                      onClick={() => setField("imageUrl", "")}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Sidebar ── */}
            <div className="space-y-4">

              {/* Publish / Save box */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Publicação</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isPublished ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {isPublished ? "Publicado" : "Rascunho"}
                  </span>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-600 rounded-lg px-3 py-2 text-xs flex items-center gap-1.5">
                    <CheckCircle size={12} />{success}
                  </div>
                )}

                {/* Buttons adapt to current status */}
                {isPublished ? (
                  <>
                    <button
                      onClick={() => { void handleSave("update"); }}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-[#1a2448] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors disabled:opacity-60"
                    >
                      <Save size={15} /> {saving ? "Salvando…" : "Salvar alterações"}
                    </button>
                    <button
                      onClick={() => { void handleSave("draft"); }}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
                    >
                      Mover para rascunho
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { void handleSave("publish"); }}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-[#c8102e] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#c8102e]/90 transition-colors disabled:opacity-60"
                    >
                      <Send size={15} /> {saving ? "Publicando…" : "Publicar agora"}
                    </button>
                    <button
                      onClick={() => { void handleSave("draft"); }}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 border border-[#1a2448] text-[#1a2448] py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
                    >
                      <Save size={15} /> {saving ? "Salvando…" : "Salvar rascunho"}
                    </button>
                  </>
                )}
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metadados</h3>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
                  <select
                    value={form.category ?? "geral"}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tag (exibida no artigo)</label>
                  <input
                    value={form.tag ?? ""}
                    onChange={(e) => setField("tag", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] uppercase font-bold"
                    placeholder="Ex: POLÍTICA"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Autor</label>
                  <input
                    value={form.author ?? ""}
                    onChange={(e) => setField("author", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Nome do autor ou redação"
                  />
                </div>

                {/* RSS info (read-only) */}
                {form.origin === "rss" && (
                  <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                    <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide">Importado via RSS</p>
                    {form.rssSourceName && (
                      <p className="text-xs text-blue-700">Fonte: {form.rssSourceName}</p>
                    )}
                    {form.aiRewritten && (
                      <p className="text-xs text-purple-600 font-semibold">✦ Reescrito com IA (SEO/AIO)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Preview toggle */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pré-visualização</h3>
                <div className="flex gap-2">
                  {(["desktop", "mobile"] as Preview[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setPreview(p); setShowPreview(true); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        preview === p && showPreview
                          ? "bg-[#1a2448] text-white border-[#1a2448]"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {p === "desktop" ? <Monitor size={13} /> : <Smartphone size={13} />}
                      {p === "desktop" ? "Desktop" : "Mobile"}
                    </button>
                  ))}
                </div>

                {showPreview && (
                  <div className={`border rounded-xl overflow-hidden bg-white shadow-sm ${
                    preview === "mobile" ? "max-w-[320px] mx-auto" : "w-full"
                  }`}>
                    <div className="bg-[#1a2448] text-white text-[10px] text-center py-1 font-mono">
                      {preview === "mobile" ? "375px – Mobile" : "Desktop"}
                    </div>
                    <div className="p-3 space-y-2">
                      {form.imageUrl && (
                        <img
                          src={form.imageUrl}
                          alt=""
                          className="w-full h-24 object-cover rounded-lg"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <span className="inline-block bg-[#c8102e] text-white text-[10px] px-2 py-0.5 rounded font-bold">
                        {form.tag || "TAG"}
                      </span>
                      <p className={`font-bold text-gray-800 leading-snug ${
                        preview === "mobile" ? "text-sm" : "text-base"
                      }`}>
                        {form.title || "Título do artigo"}
                      </p>
                      {form.subtitle && (
                        <p className="text-xs text-gray-500 line-clamp-2">{form.subtitle}</p>
                      )}
                      {form.author && (
                        <p className="text-[10px] text-gray-400">Por {form.author}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
