import React, { useEffect, useState, useRef } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import { Megaphone, Plus, Trash2, Eye, EyeOff, MousePointer, ExternalLink, ImageIcon } from "lucide-react";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export default function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [position, setPosition] = useState<"banner" | "sidebar" | "central">("banner");
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAds();
      setAds(data.ads);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await toBase64(file);
    setPreview(base64);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !link.trim() || !preview) return;
    setSubmitting(true);
    try {
      await adminApi.createAd({ name, link, imageBase64: preview, position, active: true });
      setName(""); setLink(""); setPreview(""); setShowForm(false); setPosition("banner");
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(ad: Ad) {
    try {
      await adminApi.updateAd(ad.id, { active: !ad.active });
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover esta propaganda?")) return;
    try {
      await adminApi.deleteAd(id);
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <AdminLayout title="Propagandas">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="text-[#F5A623]" size={24} />
            <h2 className="text-xl font-bold text-[#1a2448]">Gerenciar Propagandas</h2>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a2448] text-white rounded-lg hover:bg-[#2a3458] transition-colors text-sm font-semibold"
          >
            <Plus size={16} />
            {showForm ? "Fechar" : "Nova Propaganda"}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Nova Propaganda</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" placeholder="Ex: Loja ABC" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                <input value={link} onChange={(e) => setLink(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623] focus:border-transparent" placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posição</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPosition("banner")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "banner" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Banner (728×90)</button>
                <button type="button" onClick={() => setPosition("sidebar")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "sidebar" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Sidebar (160×600)</button>
                <button type="button" onClick={() => setPosition("central")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "central" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Central (1190×330)</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imagem</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <div className="flex gap-4 items-center">
                <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <ImageIcon size={16} /> Selecionar imagem
                </button>
                {preview && (
                  <div className="relative">
                    <img src={preview} alt="Preview" className={`rounded-lg border border-gray-200 object-contain ${position === "sidebar" ? "h-40" : "h-20"}`} />
                    <button type="button" onClick={() => { setPreview(""); if (fileRef.current) fileRef.current.value = ""; }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">&times;</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting || !preview} className="px-6 py-2 bg-[#F5A623] text-[#1a2448] rounded-lg font-semibold text-sm hover:bg-[#e09520] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Salvando..." : "Salvar Propaganda"}
              </button>
            </div>
          </form>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : ads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Megaphone size={32} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhuma propaganda cadastrada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {ads.map((ad) => (
              <div key={ad.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-center shadow-sm ${!ad.active ? "opacity-60" : ""}`}>
                <img src={ad.imageBase64} alt={ad.name} className={`rounded-lg border border-gray-100 object-cover shrink-0 ${ad.position === "sidebar" ? "w-16 h-24" : "w-48 h-16"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-[#1a2448] truncate">{ad.name}</h4>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ad.position === "banner" || ad.position === "central" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{ad.position}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ad.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{ad.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <a href={ad.link} target="_blank" rel="noreferrer" className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1">
                    {ad.link} <ExternalLink size={10} />
                  </a>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><MousePointer size={12} /> {ad.clicks} clique{ad.clicks !== 1 ? "s" : ""}</span>
                    <span>Criado: {new Date(ad.createdAt).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(ad)} title={ad.active ? "Desativar" : "Ativar"} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
                    {ad.active ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => handleDelete(ad.id)} title="Remover" className="w-8 h-8 rounded-lg border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
