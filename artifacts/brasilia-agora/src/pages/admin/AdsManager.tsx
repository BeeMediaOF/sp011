import React, { useEffect, useState, useRef, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Ad } from "../../lib/adminApi";
import {
  Plus, Trash2, Pencil, Search, Megaphone,
  MousePointer, Sparkles, ImageIcon, X, Upload,
  ChevronLeft, ChevronRight, Info, BarChart2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString("pt-BR");
}

function calcCTR(clicks: number, impressions: number): string {
  if (!impressions) return "0%";
  return ((clicks / impressions) * 100).toFixed(2).replace(".", ",") + "%";
}

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

// ─── Position / format maps ────────────────────────────────────────────────────
type AdPosition = Ad["position"];

const POSITION_OPTIONS: { value: AdPosition; label: string; format: string }[] = [
  { value: "slot_08", label: "Topo do site",            format: "970×250" },
  { value: "slot_07", label: "Sidebar direita",         format: "300×250" },
  { value: "slot_10", label: "Entre parágrafos",        format: "728×90"  },
  { value: "slot_09", label: "Rodapé do site",          format: "728×90"  },
  { value: "slot_01", label: "Home – após 1º bloco",    format: "970×90"  },
  { value: "slot_02", label: "Home – após 2º bloco",    format: "970×90"  },
  { value: "slot_03", label: "Home – após 4º bloco",    format: "970×250" },
  { value: "slot_04", label: "Home – após 7º bloco",    format: "970×90"  },
  { value: "slot_05", label: "Editoria – sidebar",      format: "300×250" },
  { value: "slot_06", label: "Artigo – pós texto",      format: "728×90"  },
  { value: "slot_11", label: "Arquivo – sidebar",       format: "300×250" },
  { value: "topo",    label: "Topo (legado)",           format: "728×90"  },
  { value: "centro",  label: "Centro (legado)",         format: "728×90"  },
  { value: "lateral", label: "Lateral (legado)",        format: "300×250" },
  { value: "rodape",  label: "Rodapé (legado)",         format: "728×90"  },
  { value: "banner",  label: "Banner (legado)",         format: "728×90"  },
  { value: "sidebar", label: "Sidebar (legado)",        format: "300×250" },
  { value: "central", label: "Central (legado)",        format: "728×90"  },
  { value: "slidebar_250", label: "Slidebar 250",       format: "300×250" },
  { value: "slidebar_500", label: "Slidebar 500",       format: "300×600" },
];

const POSITION_LABELS: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((p) => [p.value, p.label])
);
const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((p) => [p.value, p.format])
);

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
      Pausada
    </span>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${checked ? "bg-[#0B2A66]" : "bg-gray-300"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

// ─── Empty form factory ────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: "", position: "" as AdPosition | "", link: "", preview: "", active: true,
    targetDevices: ["desktop", "mobile", "tablet"] as ("desktop" | "mobile" | "tablet")[],
  };
}

type StatusFilter = "todos" | "ativo" | "pausado";

// ─── Ad Form Modal ────────────────────────────────────────────────────────────
function AdFormModal({
  editingId,
  form,
  setForm,
  saving,
  dragOver,
  setDragOver,
  fileRef,
  onClose,
  onSubmit,
  onFile,
}: {
  editingId: string | null;
  form: ReturnType<typeof emptyForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>;
  saving: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFile: (f: File) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: "0 24px 64px rgba(15,23,42,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              {editingId ? "Editar propaganda" : "Nova propaganda"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {editingId ? "Atualize as informações do anúncio." : "Preencha os dados para criar um novo anúncio."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-6 space-y-5">
          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Nome da propaganda <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex.: Banner Topo"
              required
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
            />
          </div>

          {/* Posição */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Posição <span className="text-red-500">*</span>
            </label>
            <select
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value as AdPosition }))}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white"
            >
              <option value="">Selecione a posição</option>
              {POSITION_OPTIONS.slice(0, 11).map((p) => (
                <option key={p.value} value={p.value}>{p.label} — {p.format}</option>
              ))}
            </select>
          </div>

          {/* Formato (derivado da posição) */}
          {form.position && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
              <Info size={13} className="text-blue-500 shrink-0" />
              <span className="text-xs text-blue-700">
                Formato recomendado: <strong>{FORMAT_LABELS[form.position] ?? "—"} px</strong>
              </span>
            </div>
          )}

          {/* Destino URL */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              URL de destino <span className="text-red-500">*</span>
            </label>
            <input
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://..."
              type="url"
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
            />
          </div>

          {/* Arquivo do anúncio */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Imagem do anúncio <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.gif"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            {form.preview ? (
              <div className="relative rounded-xl border border-gray-200 overflow-hidden">
                <img src={form.preview} alt="Preview" className="w-full max-h-36 object-contain bg-gray-50" />
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, preview: "" }));
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 cursor-pointer transition-colors ${
                  dragOver ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Upload size={22} className={dragOver ? "text-[#0B2A66]" : "text-gray-400"} />
                <p className="text-xs text-center text-gray-500 leading-relaxed">
                  Arraste e solte a imagem aqui<br />
                  <span className="text-[#0B2A66] font-medium">ou clique para selecionar</span>
                </p>
                <p className="text-[10px] text-gray-400">JPG, PNG, GIF — máx. 5MB</p>
              </div>
            )}
          </div>

          {/* Device targeting */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#0F172A]">Exibir em dispositivos</label>
            <div className="flex gap-3">
              {(["desktop", "mobile", "tablet"] as const).map((dev) => {
                const icons: Record<string, string> = { desktop: "🖥️", mobile: "📱", tablet: "💊" };
                const labels: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
                const checked = form.targetDevices.includes(dev);
                return (
                  <label key={dev} className={`flex-1 flex flex-col items-center gap-1.5 py-3 border-2 rounded-xl cursor-pointer transition-colors select-none ${checked ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => {
                      setForm((f) => ({
                        ...f,
                        targetDevices: checked
                          ? f.targetDevices.filter((d) => d !== dev)
                          : [...f.targetDevices, dev],
                      }));
                    }} />
                    <span className="text-lg">{icons[dev]}</span>
                    <span className={`text-xs font-semibold ${checked ? "text-[#0B2A66]" : "text-gray-500"}`}>{labels[dev]}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400">Selecione os dispositivos onde este anúncio deve aparecer.</p>
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <div>
              <span className="text-sm font-medium text-[#0F172A]">Status</span>
              <p className="text-xs text-gray-500 mt-0.5">{form.active ? "Anúncio visível no portal" : "Anúncio pausado"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{form.active ? "Ativo" : "Pausado"}</span>
              <ToggleSwitch
                checked={form.active}
                onChange={() => setForm((f) => ({ ...f, active: !f.active }))}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim() || !form.position || !form.link.trim() || !form.preview}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#E71D36" }}
            >
              {saving ? "Salvando…" : editingId ? "Atualizar" : "Criar propaganda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdsManager() {
  const [ads, setAds]           = useState<Ad[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [currentPage, setCurrentPage]   = useState(1);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState(emptyForm());
  const [dragOver, setDragOver]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 8;

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getAds();
      setAds(data.ads);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active           = ads.filter((a) => a.active).length;
    const totalImpressions = ads.reduce((s, a) => s + (a.impressions ?? 0), 0);
    const totalClicks      = ads.reduce((s, a) => s + (a.clicks ?? 0), 0);
    const ctr              = totalImpressions > 0
      ? ((totalClicks / totalImpressions) * 100).toFixed(2).replace(".", ",") + "%"
      : "0%";
    return { active, totalImpressions, totalClicks, ctr };
  }, [ads]);

  // ── Filtered + paginated ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = ads;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        (POSITION_LABELS[a.position] ?? a.position).toLowerCase().includes(q)
      );
    }
    if (statusFilter === "ativo")   list = list.filter((a) => a.active);
    if (statusFilter === "pausado") list = list.filter((a) => !a.active);
    return list;
  }, [ads, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function toggleActive(ad: Ad) {
    try { await adminApi.updateAd(ad.id, { active: !ad.active }); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta propaganda?")) return;
    try { await adminApi.deleteAd(id); await load(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) { alert("Arquivo maior que 5MB."); return; }
    const b64 = await toBase64(file);
    setForm((f) => ({ ...f, preview: b64 }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(ad: Ad) {
    setEditingId(ad.id);
    setForm({
      name: ad.name, position: ad.position, link: ad.link, preview: ad.imageBase64, active: ad.active,
      targetDevices: ad.targetDevices && ad.targetDevices.length > 0 ? ad.targetDevices : ["desktop", "mobile", "tablet"],
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.position || !form.link.trim() || !form.preview) return;
    setSaving(true);
    try {
      if (editingId) {
        await adminApi.updateAd(editingId, {
          name: form.name, link: form.link,
          imageBase64: form.preview, position: form.position as AdPosition, active: form.active,
          targetDevices: form.targetDevices,
        });
      } else {
        await adminApi.createAd({
          name: form.name, link: form.link,
          imageBase64: form.preview, position: form.position as AdPosition, active: form.active,
          targetDevices: form.targetDevices,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Propagandas">

      {modalOpen && (
        <AdFormModal
          editingId={editingId}
          form={form}
          setForm={setForm}
          saving={saving}
          dragOver={dragOver}
          setDragOver={setDragOver}
          fileRef={fileRef as React.RefObject<HTMLInputElement>}
          onClose={closeModal}
          onSubmit={(e) => { void handleSubmit(e); }}
          onFile={handleFile}
        />
      )}

      <div className="space-y-6">

        {/* ══ Stat cards ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Megaphone size={22} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Propagandas ativas</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.active}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">de {ads.length} cadastradas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <BarChart2 size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Impressões (total)</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtNum(stats.totalImpressions)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">todas as propagandas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <MousePointer size={22} className="text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Cliques (total)</p>
                <p className="text-2xl font-bold text-[#0F172A]">{fmtNum(stats.totalClicks)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">todas as propagandas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-fuchsia-50 flex items-center justify-center shrink-0">
                <Sparkles size={22} className="text-fuchsia-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">CTR médio</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.ctr}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">cliques ÷ impressões</p>
          </div>
        </div>

        {/* ══ Table card ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>

          {/* Filter bar */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar propagandas..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white"
              >
                <option value="todos">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
              </select>
            </div>
            <button
              onClick={openNew}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#E71D36" }}
            >
              <Plus size={16} />
              Nova propaganda
            </button>
          </div>

          {/* Table body */}
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Carregando propagandas…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-4 text-gray-400">
              <Megaphone size={36} className="text-gray-200" />
              <p className="text-sm">Nenhuma propaganda encontrada</p>
              <button
                onClick={openNew}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: "#E71D36" }}
              >
                <Plus size={15} /> Criar primeira propaganda
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Propaganda</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Posição</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Formato</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Impressões</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Cliques</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">CTR</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((ad, i) => (
                      <tr
                        key={ad.id}
                        className={`hover:bg-gray-50/50 transition-colors ${i < paginated.length - 1 ? "border-b border-gray-50" : ""}`}
                      >
                        {/* Propaganda */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-9 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 shrink-0 flex items-center justify-center">
                              {ad.imageBase64 ? (
                                <img src={ad.imageBase64} alt={ad.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={14} className="text-gray-300" />
                              )}
                            </div>
                            <span className="font-medium text-[#0F172A] text-sm whitespace-nowrap">{ad.name}</span>
                          </div>
                        </td>
                        {/* Posição */}
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {POSITION_LABELS[ad.position] ?? ad.position}
                        </td>
                        {/* Formato */}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {FORMAT_LABELS[ad.position] ?? "—"}
                        </td>
                        {/* Impressões */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">
                          {fmtNum(ad.impressions ?? 0)}
                        </td>
                        {/* Cliques */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">
                          {fmtNum(ad.clicks ?? 0)}
                        </td>
                        {/* CTR */}
                        <td className="px-4 py-3 text-right text-xs font-mono text-gray-700">
                          {calcCTR(ad.clicks ?? 0, ad.impressions ?? 0)}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <StatusBadge active={ad.active} />
                        </td>
                        {/* Ações */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEdit(ad)}
                              title="Editar"
                              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-[#0B2A66] transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <ToggleSwitch
                              checked={ad.active}
                              onChange={() => { void toggleActive(ad); }}
                            />
                            <button
                              onClick={() => { void handleDelete(ad.id); }}
                              title="Excluir"
                              className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-gray-500">
                  Mostrando {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} propagandas
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 4) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            currentPage === page
                              ? "bg-[#0B2A66] text-white"
                              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    {totalPages > 4 && (
                      <>
                        <span className="text-gray-400 text-xs px-1">…</span>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                            currentPage === totalPages
                              ? "bg-[#0B2A66] text-white"
                              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Tips */}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Dicas</span>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-1.5">
            {[
              "Use formatos responsivos para melhor experiência.",
              "Verifique o tamanho máximo do arquivo (5MB).",
              "Anúncios inativos não serão exibidos no site.",
              "O botão liga/desliga na tabela ativa ou pausa sem abrir o formulário.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-blue-700">
                <span className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </AdminLayout>
  );
}
