import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Article } from "../../lib/adminApi";
import { Save, Send, ArrowLeft, Monitor, Smartphone } from "lucide-react";

const CATEGORIES = [
  "politica","cidade","seguranca","transporte","saude","educacao","cultura","esportes","colunas","brasil","mundo","geral"
];

const empty: Partial<Article> = {
  title: "", subtitle: "", content: "", category: "politica",
  tag: "POLÍTICA", imageUrl: "", author: "Redação Brasília Hoje", status: "draft",
};

type Preview = "desktop" | "mobile";

export default function ArticleEdit() {
  const [, navigate] = useLocation();
  const [matchEdit, paramsEdit] = useRoute("/admin/artigos/:id");
  const isNew = !matchEdit || paramsEdit?.id === "novo";
  const articleId = isNew ? null : (paramsEdit?.id ?? null);

  const [form, setForm] = useState<Partial<Article>>(empty);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<Preview>("desktop");
  const [showPreview, setShowPreview] = useState(false);

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

  async function handleSave(publish: boolean) {
    setError(""); setSuccess("");
    if (!form.title?.trim()) { setError("O título é obrigatório"); return; }
    setSaving(true);
    try {
      const data = { ...form, status: publish ? "published" as const : (form.status ?? "draft") };
      if (isNew) {
        const { article } = await adminApi.createArticle(data);
        setSuccess(publish ? "Artigo publicado!" : "Rascunho salvo!");
        setTimeout(() => navigate(`/admin/artigos/${article.id}`), 1000);
      } else {
        const { article } = await adminApi.updateArticle(articleId!, data);
        if (publish && article.status !== "published") {
          await adminApi.publishArticle(article.id);
        }
        setForm(article);
        setSuccess(publish ? "Artigo publicado!" : "Salvo com sucesso!");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const title = isNew ? "Novo Artigo" : "Editar Artigo";

  return (
    <AdminLayout title={title}>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Back */}
        <button
          onClick={() => navigate("/admin/artigos")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para artigos
        </button>

        {loading ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main form */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Título *</label>
                  <input
                    value={form.title ?? ""}
                    onChange={(e) => setField("title", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Título do artigo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Subtítulo / Lide</label>
                  <input
                    value={form.subtitle ?? ""}
                    onChange={(e) => setField("subtitle", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Resumo curto do artigo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Conteúdo</label>
                  <textarea
                    value={form.content ?? ""}
                    onChange={(e) => setField("content", e.target.value)}
                    rows={12}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] resize-y font-mono"
                    placeholder="Texto completo do artigo..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">URL da Imagem</label>
                  <input
                    value={form.imageUrl ?? ""}
                    onChange={(e) => setField("imageUrl", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="https://..."
                  />
                  {form.imageUrl && (
                    <img src={form.imageUrl} alt="preview" className="mt-2 h-32 w-auto rounded-lg object-cover" />
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Publish box */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Publicação</h3>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs">{error}</div>
                )}
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-600 rounded-lg px-3 py-2 text-xs">{success}</div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select
                    value={form.status ?? "draft"}
                    onChange={(e) => setField("status", e.target.value as "draft" | "published")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>

                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 border border-[#1a2448] text-[#1a2448] py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  <Save size={15} /> Salvar rascunho
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-[#1a2448] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors disabled:opacity-60"
                >
                  <Send size={15} /> Publicar
                </button>
              </div>

              {/* Metadata */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metadados</h3>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
                  <select
                    value={form.category ?? "geral"}
                    onChange={(e) => setField("category", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448] capitalize"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="capitalize">{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tag (exibida)</label>
                  <input
                    value={form.tag ?? ""}
                    onChange={(e) => setField("tag", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                    placeholder="Ex: POLÍTICA"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Autor</label>
                  <input
                    value={form.author ?? ""}
                    onChange={(e) => setField("author", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]"
                  />
                </div>
              </div>

              {/* Preview toggle */}
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pré-visualização</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPreview("desktop"); setShowPreview(true); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors
                      ${preview === "desktop" && showPreview ? "bg-[#1a2448] text-white border-[#1a2448]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    <Monitor size={14} /> Desktop
                  </button>
                  <button
                    onClick={() => { setPreview("mobile"); setShowPreview(true); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors
                      ${preview === "mobile" && showPreview ? "bg-[#1a2448] text-white border-[#1a2448]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    <Smartphone size={14} /> Mobile
                  </button>
                </div>

                {showPreview && (
                  <div className={`border rounded-lg overflow-hidden bg-gray-100 ${preview === "mobile" ? "max-w-[375px] mx-auto" : "w-full"}`}>
                    <div className="bg-[#1a2448] text-white text-xs text-center py-1 font-mono">
                      {preview === "mobile" ? "375px – Mobile" : "Desktop"}
                    </div>
                    <div className="p-3 space-y-1.5">
                      {form.imageUrl && (
                        <img src={form.imageUrl} alt="" className="w-full h-20 object-cover rounded" />
                      )}
                      <span className="inline-block bg-[#F5A623] text-white text-xs px-1.5 py-0.5 rounded font-bold">
                        {form.tag || "TAG"}
                      </span>
                      <p className={`font-bold text-gray-800 leading-tight ${preview === "mobile" ? "text-sm" : "text-base"}`}>
                        {form.title || "Título do artigo"}
                      </p>
                      <p className="text-xs text-gray-500 line-clamp-2">{form.subtitle}</p>
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
