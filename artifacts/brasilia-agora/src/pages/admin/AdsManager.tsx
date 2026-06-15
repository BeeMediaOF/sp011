import React, { useEffect, useState, useRef, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import { Megaphone, Plus, Trash2, Eye, EyeOff, MousePointer, ExternalLink, ImageIcon, Layers, Zap, TrendingUp } from "lucide-react";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

type AdPosition = Ad["position"];

// ─── Slot definitions ─────────────────────────────────────────────────────────
const SLOTS: {
  key: AdPosition;
  label: string;
  desc: string;
  dims: string;
  color: string;
  badge: string;
  preview: string;
}[] = [
  {
    key:     "slot_01",
    label:   "Propaganda 01",
    desc:    "Logo após o bloco principal (hero)",
    dims:    "Livre",
    color:   "bg-red-100 text-red-700 border-red-200",
    badge:   "bg-red-100 text-red-700",
    preview: "w-56 h-10",
  },
  {
    key:     "slot_02",
    label:   "Propaganda 02",
    desc:    "Após a 2ª seção de notícias",
    dims:    "Livre",
    color:   "bg-blue-100 text-blue-700 border-blue-200",
    badge:   "bg-blue-100 text-blue-700",
    preview: "w-56 h-10",
  },
  {
    key:     "slot_03",
    label:   "Propaganda 03",
    desc:    "No meio da página",
    dims:    "Livre",
    color:   "bg-purple-100 text-purple-700 border-purple-200",
    badge:   "bg-purple-100 text-purple-700",
    preview: "w-56 h-10",
  },
  {
    key:     "slot_04",
    label:   "Propaganda 04",
    desc:    "Na parte inferior da página",
    dims:    "Livre",
    color:   "bg-orange-100 text-orange-700 border-orange-200",
    badge:   "bg-orange-100 text-orange-700",
    preview: "w-56 h-10",
  },
  {
    key:     "slot_05",
    label:   "Propaganda 05 – SlideBar",
    desc:    "Barra lateral fixa (slide bar)",
    dims:    "Livre",
    color:   "bg-teal-100 text-teal-700 border-teal-200",
    badge:   "bg-teal-100 text-teal-700",
    preview: "w-16 h-20",
  },
];

// Legacy slots (backward compat display only)
const LEGACY: Record<string, { label: string; badge: string; preview: string }> = {
  topo:        { label: "Topo (legado)",              badge: "bg-gray-100 text-gray-500", preview: "w-56 h-14" },
  centro:      { label: "Centro (legado)",            badge: "bg-gray-100 text-gray-500", preview: "w-56 h-8"  },
  lateral:     { label: "Lateral (legado)",           badge: "bg-gray-100 text-gray-500", preview: "w-10 h-24" },
  rodape:      { label: "Rodapé (legado)",            badge: "bg-gray-100 text-gray-500", preview: "w-52 h-14" },
  slidebar_250:{ label: "Slide Bar 250 (legado)",     badge: "bg-gray-100 text-gray-500", preview: "w-16 h-14" },
  slidebar_500:{ label: "Slide Bar 500 (legado)",     badge: "bg-gray-100 text-gray-500", preview: "w-16 h-24" },
  banner:      { label: "Banner (legado)",            badge: "bg-gray-100 text-gray-500", preview: "w-48 h-10" },
  sidebar:     { label: "Sidebar (legado)",           badge: "bg-gray-100 text-gray-500", preview: "w-10 h-24" },
  central:     { label: "Central (legado)",           badge: "bg-gray-100 text-gray-500", preview: "w-52 h-14" },
};

function slotInfo(pos: AdPosition) {
  const found = SLOTS.find((s) => s.key === pos);
  if (found) return { label: found.label, badge: found.badge, preview: found.preview };
  const leg = LEGACY[pos as string];
  if (leg) return leg;
  return { label: pos, badge: "bg-gray-100 text-gray-500", preview: "w-48 h-10" };
}

type FilterKey = "all" | "active" | "inactive" | AdPosition;

export default function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [position, setPosition] = useState<AdPosition>("topo");
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = ads.length;
    const active = ads.filter((a) => a.active).length;
    const totalClicks = ads.reduce((sum, a) => sum + (a.clicks ?? 0), 0);
    const byPos: Record<string, number> = {};
    ads.forEach((a) => { byPos[a.position] = (byPos[a.position] ?? 0) + 1; });
    return { total, active, inactive: total - active, totalClicks, byPos };
  }, [ads]);

  const load = async () => {
    setLoading(true);
    try { const data = await adminApi.getAds(); setAds(data.ads); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(await toBase64(file));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !link.trim() || !preview) return;
    setSubmitting(true);
    try {
      await adminApi.createAd({ name, link, imageBase64: preview, position, active: true });
      setName(""); setLink(""); setPreview(""); setShowForm(false); setPosition("topo");
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(ad: Ad) {
    try { await adminApi.updateAd(ad.id, { active: !ad.active }); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta propaganda?")) return;
    try { await adminApi.deleteAd(id); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  const filteredAds = useMemo(() => {
    if (filter === "all")      return ads;
    if (filter === "active")   return ads.filter((a) => a.active);
    if (filter === "inactive") return ads.filter((a) => !a.active);
    return ads.filter((a) => a.position === filter);
  }, [ads, filter]);

  const selectedSlot = SLOTS.find((s) => s.key === position);

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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={18} className="text-blue-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Total</span>
            </div>
            <div className="text-3xl font-black text-[#1a2448]">{stats.total}</div>
            <div className="text-xs text-gray-400 mt-1">propagandas cadastradas</div>
          </div>
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={18} className="text-green-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Ativos</span>
            </div>
            <div className="text-3xl font-black text-green-600">{stats.active}</div>
            <div className="text-xs text-gray-400 mt-1">{stats.inactive} inativos</div>
          </div>
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <MousePointer size={18} className="text-orange-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Cliques</span>
            </div>
            <div className="text-3xl font-black text-orange-600">{stats.totalClicks}</div>
            <div className="text-xs text-gray-400 mt-1">interações totais</div>
          </div>
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-purple-600" />
              <span className="text-xs font-semibold text-gray-500 uppercase">Por Espaço</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {SLOTS.map((s) => stats.byPos[s.key] ? (
                <span key={s.key} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.badge}`}>
                  {s.label.split(" ")[0]}: {stats.byPos[s.key]}
                </span>
              ) : null)}
              {stats.byPos["banner"] || stats.byPos["sidebar"] || stats.byPos["central"] ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">leg: {(stats.byPos["banner"] ?? 0) + (stats.byPos["sidebar"] ?? 0) + (stats.byPos["central"] ?? 0)}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Mapa visual de espaços ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Espaços disponíveis</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SLOTS.map((s) => (
              <div key={s.key} className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${s.color}`}>
                <div className={`shrink-0 rounded bg-current opacity-20 ${s.preview}`} />
                <div className="min-w-0">
                  <p className="font-bold text-sm leading-tight">{s.label}</p>
                  <p className="text-[11px] opacity-80 mt-0.5">{s.dims} px</p>
                  <p className="text-[10px] opacity-60 mt-0.5 truncate">{s.desc}</p>
                </div>
                <span className="ml-auto shrink-0 text-[11px] font-black">
                  {stats.byPos[s.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-xl border p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Nova Propaganda</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do anunciante</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623] focus:border-transparent"
                  placeholder="Ex: Loja ABC" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link de destino</label>
                <input value={link} onChange={(e) => setLink(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F5A623] focus:border-transparent"
                  placeholder="https://..." />
              </div>
            </div>

            {/* Position selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Espaço publicitário</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SLOTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setPosition(s.key)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                      position === s.key
                        ? "border-[#F5A623] bg-amber-50 ring-2 ring-[#F5A623]/30"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <p className="font-semibold text-sm text-[#1a2448]">{s.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{s.dims} px</p>
                  </button>
                ))}
              </div>
              {selectedSlot && (
                <p className="mt-1.5 text-xs text-gray-400">
                  ↳ {selectedSlot.desc} — imagem recomendada: <span className="font-semibold">{selectedSlot.dims}</span> px
                </p>
              )}
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imagem da propaganda</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <div className="flex gap-4 items-center">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <ImageIcon size={16} /> Selecionar imagem
                </button>
                {preview && (
                  <div className="relative">
                    <img src={preview} alt="Preview"
                      className={`rounded-lg border border-gray-200 object-contain ${selectedSlot?.preview ?? "w-48 h-16"}`} />
                    <button type="button"
                      onClick={() => { setPreview(""); if (fileRef.current) fileRef.current.value = ""; }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                      &times;
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={submitting || !preview}
                className="px-6 py-2 bg-[#F5A623] text-[#1a2448] rounded-lg font-semibold text-sm hover:bg-[#e09520] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Salvando..." : "Salvar Propaganda"}
              </button>
            </div>
          </form>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2">
          {([
            { key: "all",      label: "Todas" },
            { key: "active",   label: "Ativas" },
            { key: "inactive", label: "Inativas" },
            ...SLOTS.map((s) => ({ key: s.key, label: s.label })),
          ] as { key: FilterKey; label: string }[]).map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                filter === f.key ? "bg-[#1a2448] text-white border-[#1a2448]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400 self-center">
            {filteredAds.length} resultado{filteredAds.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border text-gray-400">
            <Megaphone size={32} className="mx-auto mb-3 text-gray-300" />
            <p>Nenhuma propaganda encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredAds.map((ad) => {
              const info = slotInfo(ad.position);
              return (
                <div key={ad.id} className={`bg-white rounded-xl border p-4 flex gap-4 items-start shadow-sm ${!ad.active ? "opacity-60" : ""}`}>
                  <div className="shrink-0">
                    <img src={ad.imageBase64} alt={ad.name}
                      className={`rounded-lg border border-gray-100 object-cover ${info.preview}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-bold text-[#1a2448] truncate">{ad.name}</h4>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${info.badge}`}>
                        {info.label}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${ad.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {ad.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <a href={ad.link} target="_blank" rel="noreferrer"
                      className="text-xs text-[#1d4ed8] hover:underline flex items-center gap-1 break-all">
                      {ad.link} <ExternalLink size={10} />
                    </a>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1 text-orange-600 font-semibold">
                        <MousePointer size={12} /> {ad.clicks} clique{ad.clicks !== 1 ? "s" : ""}
                      </span>
                      <span>Criado: {new Date(ad.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(ad)} title={ad.active ? "Desativar" : "Ativar"}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
                      {ad.active ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => handleDelete(ad.id)} title="Remover"
                      className="w-8 h-8 rounded-lg border border-red-200 flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
