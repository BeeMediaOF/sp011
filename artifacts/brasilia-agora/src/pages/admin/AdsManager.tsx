import React, { useEffect, useState, useRef, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import { Megaphone, Plus, Trash2, Eye, EyeOff, MousePointer, ExternalLink, ImageIcon, BarChart3, Layers, Zap, TrendingUp } from "lucide-react";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

const POSITION_LABELS: Record<string, string> = {
  banner: "Banner 728×90",
  sidebar: "Sidebar 160×600",
  central: "Central 1190×330",
};

const POSITION_COLORS: Record<string, string> = {
  banner: "bg-blue-100 text-blue-700",
  sidebar: "bg-purple-100 text-purple-700",
  central: "bg-orange-100 text-orange-700",
};

const POSITION_PREVIEW: Record<string, string> = {
  banner: "w-48 h-16",
  sidebar: "w-16 h-24",
  central: "w-56 h-20",
};

export default function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [position, setPosition] = useState<"banner" | "sidebar" | "central">("banner");
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "banner" | "sidebar" | "central" | "active" | "inactive">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = ads.length;
    const active = ads.filter((a) => a.active).length;
    const inactive = total - active;
    const totalClicks = ads.reduce((sum, a) => sum + (a.clicks ?? 0), 0);
    const byPos = { banner: 0, sidebar: 0, central: 0 };
    ads.forEach((a) => { byPos[a.position as keyof typeof byPos] = (byPos[a.position as keyof typeof byPos] ?? 0) + 1; });
    return { total, active, inactive, totalClicks, byPos };
  }, [ads]);

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

  const filteredAds = useMemo(() => {
    if (filter === "all") return ads;
    if (filter === "active") return ads.filter((a) => a.active);
    if (filter === "inactive") return ads.filter((a) => !a.active);
    return ads.filter((a) => a.position === filter);
  }, [ads, filter]);

  return (
    <AdminLayout title="Propagandas">
      <div className="max-w-6xl mx-auto space-y-6">
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

        {/* Big Numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={18} className="text-blue-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Total</span>
            </div>
            <div className="text-3xl font-black text-[#1a2448]">{stats.total}</div>
            <div className="text-xs text-gray-400 mt-1">propagandas cadastradas</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={18} className="text-green-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Ativos</span>
            </div>
            <div className="text-3xl font-black text-green-600">{stats.active}</div>
            <div className="text-xs text-gray-400 mt-1">{stats.inactive} inativos</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <MousePointer size={18} className="text-orange-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Cliques</span>
            </div>
            <div className="text-3xl font-black text-orange-600">{stats.totalClicks}</div>
            <div className="text-xs text-gray-400 mt-1">interações totais</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={18} className="text-purple-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Por Posição</span>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">B: {stats.byPos.banner}</span>
              <span className="px-2 py-1 rounded bg-purple-50 text-purple-700">S: {stats.byPos.sidebar}</span>
              <span className="px-2 py-1 rounded bg-orange-50 text-orange-700">C: {stats.byPos.central}</span>
            </div>
          </div>
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
              <div className="flex gap-3 flex-wrap">
                <button type="button" onClick={() => setPosition("banner")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "banner" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Banner (728×90)</button>
                <button type="button" onClick={() => setPosition("sidebar")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "sidebar" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Sidebar (160×600)</button>
                <button type="button" onClick={() => setPosition("central")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${position === "central" ? "bg-[#F5A623] text-white border-[#F5A623]" : "bg-white text-gray-600 border-gray-300"}`}>Central (952×264)</button>
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
                    <img src={preview} alt="Preview" className={`rounded-lg border border-gray-200 object-contain ${POSITION_PREVIEW[position]}`} />
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

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "inactive", "banner", "sidebar", "central"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${filter === f ? "bg-[#1a2448] text-white border-[#1a2448]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              {f === "all" && "Todas"}
              {f === "active" && "Ativas"}
              {f === "inactive" && "Inativas"}
              {f === "banner" && "Banners"}
              {f === "sidebar" && "Sidebars"}
              {f === "central" && "Centrais"}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 self-center">{filteredAds.length} resultado{filteredAds.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Megaphone size={32} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhuma propaganda encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredAds.map((ad) => (
              <div key={ad.id} className={`bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-start shadow-sm ${!ad.active ? "opacity-60" : ""}`}>
                <div className="shrink-0">
                  <img src={ad.imageBase64} alt={ad.name} className={`rounded-lg border border-gray-100 object-cover ${POSITION_PREVIEW[ad.position] || "w-48 h-16"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-bold text-[#1a2448] truncate">{ad.name}</h4>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${POSITION_COLORS[ad.position] || "bg-gray-100 text-gray-500"}`}>{ad.position}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ad.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{ad.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <a href={ad.link} target="_blank" rel="noreferrer" className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1 break-all">
                    {ad.link} <ExternalLink size={10} />
                  </a>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1 text-orange-600 font-semibold"><MousePointer size={12} /> {ad.clicks} clique{ad.clicks !== 1 ? "s" : ""}</span>
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
