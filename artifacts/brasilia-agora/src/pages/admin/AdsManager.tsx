import React, { useEffect, useState, useRef, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import {
  Plus, Trash2, Eye, EyeOff, MousePointer, ExternalLink,
  ImageIcon, CheckCircle, X, LayoutTemplate, Home, Newspaper, GalleryHorizontal,
} from "lucide-react";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

type AdPosition = Ad["position"];

// ─── Slot definitions ──────────────────────────────────────────────────────────
const SLOTS: {
  key: AdPosition;
  label: string;
  location: string;
  hint: string;
  pagePos: string;
  icon: React.ReactNode;
  accent: string;
  bg: string;
}[] = [
  {
    key:      "slot_01",
    label:    "Espaço 1 — Home",
    location: "Após o 1º bloco de notícias",
    hint:     "Banner horizontal, largura total. Ex: 970×90 px",
    pagePos:  "top-[22%]",
    icon:     <Home size={14} />,
    accent:   "#c8102e",
    bg:       "bg-red-50 border-red-200",
  },
  {
    key:      "slot_02",
    label:    "Espaço 2 — Home",
    location: "Após o 2º bloco de notícias",
    hint:     "Banner horizontal, largura total. Ex: 970×90 px",
    pagePos:  "top-[38%]",
    icon:     <Home size={14} />,
    accent:   "#0b3d91",
    bg:       "bg-blue-50 border-blue-200",
  },
  {
    key:      "slot_03",
    label:    "Espaço 3 — Home",
    location: "Após o 4º bloco de notícias",
    hint:     "Banner horizontal, largura total. Ex: 970×250 px",
    pagePos:  "top-[55%]",
    icon:     <Home size={14} />,
    accent:   "#7c3aed",
    bg:       "bg-purple-50 border-purple-200",
  },
  {
    key:      "slot_04",
    label:    "Espaço 4 — Home",
    location: "Após o 7º bloco de notícias",
    hint:     "Banner horizontal, largura total. Ex: 970×90 px",
    pagePos:  "top-[72%]",
    icon:     <Home size={14} />,
    accent:   "#ea580c",
    bg:       "bg-orange-50 border-orange-200",
  },
  {
    key:      "slot_05",
    label:    "Espaço 5 — Editorias",
    location: "Dentro das páginas de editoria",
    hint:     "Banner ou retângulo. Ex: 300×250 px",
    pagePos:  "top-[45%]",
    icon:     <Newspaper size={14} />,
    accent:   "#0d9488",
    bg:       "bg-teal-50 border-teal-200",
  },
];

// ─── Add form (per-slot) ───────────────────────────────────────────────────────
interface SlotFormProps {
  slotKey: AdPosition;
  onSaved: () => void;
  onCancel: () => void;
}

function SlotForm({ slotKey, onSaved, onCancel }: SlotFormProps) {
  const [name, setName]       = useState("");
  const [link, setLink]       = useState("");
  const [preview, setPreview] = useState("");
  const [saving, setSaving]   = useState(false);
  const fileRef               = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(await toBase64(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !link.trim() || !preview) return;
    setSaving(true);
    try {
      await adminApi.createAd({ name, link, imageBase64: preview, position: slotKey, active: true });
      onSaved();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mt-3 space-y-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-gray-700">Adicionar propaganda</p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Anunciante</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ex: Loja ABC"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Link ao clicar</label>
          <input
            value={link} onChange={(e) => setLink(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://..."
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Imagem da propaganda</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        {!preview ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors w-full justify-center"
          >
            <ImageIcon size={16} />
            Clique para selecionar a imagem
          </button>
        ) : (
          <div className="flex items-start gap-3">
            <img src={preview} alt="Preview" className="max-h-24 max-w-xs rounded-lg border border-gray-200 object-contain" />
            <button
              type="button"
              onClick={() => { setPreview(""); if (fileRef.current) fileRef.current.value = ""; }}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 mt-1"
            >
              <X size={12} /> Trocar imagem
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !preview || !name.trim() || !link.trim()}
          className="px-5 py-2 bg-[#1a2448] text-white rounded-lg text-sm font-semibold hover:bg-[#2a3458] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? "Salvando..." : <><CheckCircle size={14} /> Publicar propaganda</>}
        </button>
      </div>
    </form>
  );
}

// ─── Ad card ──────────────────────────────────────────────────────────────────
interface AdCardProps {
  ad: Ad;
  accent: string;
  onToggle: (ad: Ad) => void;
  onDelete: (id: string) => void;
}

function AdCard({ ad, accent, onToggle, onDelete }: AdCardProps) {
  return (
    <div className={`flex gap-4 items-start p-4 rounded-xl border bg-white shadow-sm transition-opacity ${!ad.active ? "opacity-50" : ""}`}>
      <div className="shrink-0 w-[120px] h-[72px] overflow-hidden rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center">
        <img src={ad.imageBase64} alt={ad.name} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-bold text-[#1a2448] truncate text-sm">{ad.name}</p>
          <span
            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
            style={{ backgroundColor: accent + "20", color: accent }}
          >
            {ad.active ? "● Ativo" : "● Inativo"}
          </span>
        </div>
        <a
          href={ad.link} target="_blank" rel="noreferrer"
          className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5 break-all"
        >
          {ad.link.length > 50 ? ad.link.slice(0, 50) + "…" : ad.link}
          <ExternalLink size={10} />
        </a>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[11px] text-orange-600 font-semibold">
            <MousePointer size={11} /> {ad.clicks ?? 0} clique{ad.clicks !== 1 ? "s" : ""}
          </span>
          <span className="text-[11px] text-gray-400">
            {new Date(ad.createdAt).toLocaleDateString("pt-BR")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onToggle(ad)}
          title={ad.active ? "Pausar" : "Ativar"}
          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
        >
          {ad.active ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          onClick={() => onDelete(ad.id)}
          title="Excluir"
          className="w-8 h-8 rounded-lg border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Page map visual ──────────────────────────────────────────────────────────
function PageMap({ adsBySlot }: { adsBySlot: Record<string, Ad[]> }) {
  const homeSlots = SLOTS.filter((s) => s.key !== "slot_05");
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <LayoutTemplate size={16} className="text-gray-500" />
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mapa da página</h3>
        <span className="text-[11px] text-gray-400 ml-1">— onde cada espaço aparece na home</span>
      </div>
      <div className="flex gap-6 items-start">
        {/* Visual page mockup */}
        <div className="shrink-0 relative w-[140px] h-[320px] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
          {/* Header bar */}
          <div className="h-7 bg-gray-300 border-b border-gray-300 flex items-center px-2 gap-1">
            <div className="w-14 h-3 bg-gray-400 rounded-sm" />
          </div>
          {/* Content area */}
          <div className="p-1.5 space-y-1">
            {/* Hero */}
            <div className="h-14 bg-gray-300 rounded-sm" />
            {/* Slot 01 */}
            <div
              className="h-3 rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: SLOTS[0].accent }}
            >
              AD 1
            </div>
            {/* Block */}
            <div className="h-10 bg-gray-200 rounded-sm" />
            {/* Slot 02 */}
            <div
              className="h-3 rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: SLOTS[1].accent }}
            >
              AD 2
            </div>
            {/* Block */}
            <div className="h-10 bg-gray-200 rounded-sm" />
            {/* Block */}
            <div className="h-8 bg-gray-200 rounded-sm" />
            {/* Slot 03 */}
            <div
              className="h-3 rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: SLOTS[2].accent }}
            >
              AD 3
            </div>
            {/* Block */}
            <div className="h-8 bg-gray-200 rounded-sm" />
            {/* Block */}
            <div className="h-8 bg-gray-200 rounded-sm" />
            {/* Block */}
            <div className="h-8 bg-gray-200 rounded-sm" />
            {/* Slot 04 */}
            <div
              className="h-3 rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
              style={{ backgroundColor: SLOTS[3].accent }}
            >
              AD 4
            </div>
          </div>
        </div>

        {/* Slot legend */}
        <div className="flex-1 space-y-2">
          {homeSlots.map((s) => {
            const count = adsBySlot[s.key]?.length ?? 0;
            const active = adsBySlot[s.key]?.filter((a) => a.active).length ?? 0;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-8 h-5 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0"
                  style={{ backgroundColor: s.accent }}>
                  {s.key.replace("slot_0", "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{s.location}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${count === 0 ? "bg-gray-100 text-gray-400" : "bg-green-100 text-green-700"}`}>
                  {count === 0 ? "Vazio" : `${active} ativo${active !== 1 ? "s" : ""}`}
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100 mt-2">
            <div className="w-8 h-5 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0"
              style={{ backgroundColor: SLOTS[4].accent }}>
              5
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-700 truncate">Páginas de editoria</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${(adsBySlot["slot_05"]?.length ?? 0) === 0 ? "bg-gray-100 text-gray-400" : "bg-green-100 text-green-700"}`}>
              {(adsBySlot["slot_05"]?.length ?? 0) === 0 ? "Vazio" : `${adsBySlot["slot_05"]?.filter((a) => a.active).length ?? 0} ativo${(adsBySlot["slot_05"]?.filter((a) => a.active).length ?? 0) !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdsManager() {
  const [ads, setAds]         = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState<AdPosition | null>(null);

  const load = async () => {
    setLoading(true);
    try { const data = await adminApi.getAds(); setAds(data.ads); }
    catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const adsBySlot = useMemo(() => {
    const map: Record<string, Ad[]> = {};
    SLOTS.forEach((s) => { map[s.key] = []; });
    ads.forEach((a) => {
      if (map[a.position]) map[a.position].push(a);
    });
    return map;
  }, [ads]);

  const totalActive = useMemo(() => ads.filter((a) => a.active).length, [ads]);

  async function toggleActive(ad: Ad) {
    try { await adminApi.updateAd(ad.id, { active: !ad.active }); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta propaganda?")) return;
    try { await adminApi.deleteAd(id); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  return (
    <AdminLayout title="Propagandas">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-[#1a2448]">Propagandas</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? "Carregando…" : `${ads.length} propaganda${ads.length !== 1 ? "s" : ""} · ${totalActive} ativa${totalActive !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* ── Mapa visual ── */}
        <PageMap adsBySlot={adsBySlot} />

        {/* ── Slots ── */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Carregando propagandas…</div>
        ) : (
          <div className="space-y-4">
            {SLOTS.map((slot) => {
              const slotAds = adsBySlot[slot.key] ?? [];
              const isOpen  = openForm === slot.key;

              return (
                <div key={slot.key} className={`rounded-xl border-2 overflow-hidden ${slot.bg}`}>
                  {/* Slot header */}
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: slot.accent }}
                    >
                      {slot.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#1a2448] text-sm">{slot.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{slot.location} · {slot.hint}</p>
                    </div>
                    {slotAds.length > 1 && (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 shrink-0">
                        <GalleryHorizontal size={11} />
                        Carrossel · {slotAds.length}
                      </span>
                    )}
                    {slotAds.length === 1 && (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/80 text-gray-600 shrink-0">
                        1 anúncio
                      </span>
                    )}
                    <button
                      onClick={() => setOpenForm(isOpen ? null : slot.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors shrink-0"
                      style={{ backgroundColor: slot.accent }}
                    >
                      <Plus size={13} />
                      {isOpen ? "Fechar" : "Adicionar"}
                    </button>
                  </div>

                  {/* Inline add form */}
                  {isOpen && (
                    <div className="px-5 pb-4">
                      <SlotForm
                        slotKey={slot.key}
                        onSaved={() => { setOpenForm(null); load(); }}
                        onCancel={() => setOpenForm(null)}
                      />
                    </div>
                  )}

                  {/* Ad cards */}
                  {slotAds.length > 0 && (
                    <div className="px-5 pb-4 space-y-2">
                      {slotAds.map((ad) => (
                        <AdCard
                          key={ad.id}
                          ad={ad}
                          accent={slot.accent}
                          onToggle={toggleActive}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {slotAds.length === 0 && !isOpen && (
                    <div className="px-5 pb-4">
                      <div className="rounded-lg border border-dashed border-current/30 py-4 flex items-center justify-center gap-2 opacity-40">
                        <ImageIcon size={14} />
                        <span className="text-xs font-medium">Espaço vazio — clique em Adicionar para publicar aqui</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
