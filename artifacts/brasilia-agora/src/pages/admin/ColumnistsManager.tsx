import React, { useEffect, useRef, useState, useMemo } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Columnist, type ColumnistSpecialty } from "../../lib/adminApi";
import {
  Plus, Trash2, Pencil, Search, UserCheck, UserX,
  Users, FileText, Upload, X, ChevronLeft, ChevronRight,
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

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";

const SPECIALTIES: ColumnistSpecialty[] = [
  "Política", "Esporte", "Economia", "Cultura", "Segurança Pública", "Social", "Outro",
];

const COLUMN_NAMES: Record<ColumnistSpecialty, string> = {
  "Política":          "Política em Foco",
  "Esporte":           "Esportes na Área",
  "Economia":          "Economia & Negócios",
  "Cultura":           "Cultura & Lazer",
  "Segurança Pública": "Segurança Pública",
  "Social":            "Social & Comportamento",
  "Outro":             "Opinião",
};

const SPECIALTY_COLORS: Record<ColumnistSpecialty, { bg: string; text: string }> = {
  "Política":          { bg: "#EFF6FF", text: "#1d4ed8" },
  "Esporte":           { bg: "#FEF2F2", text: "#dc2626" },
  "Economia":          { bg: "#FFFBEB", text: "#b45309" },
  "Cultura":           { bg: "#F0FDFA", text: "#0d9488" },
  "Segurança Pública": { bg: "#F5F3FF", text: "#7c3aed" },
  "Social":            { bg: "#ECFDF5", text: "#16a34a" },
  "Outro":             { bg: "#F9FAFB", text: "#6b7280" },
};

// ─── Avatar component ──────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36 }: { src: string; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src} alt={name}
        className="rounded-full object-cover border-2 border-white shadow-sm shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-[#0B2A66] to-[#1e40af] flex items-center justify-center shrink-0 border-2 border-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-white" style={{ fontSize: size * 0.34 }}>{initials}</span>
    </div>
  );
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────
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

type StatusFilter = "todos" | "ativo" | "inativo";

function emptyForm() {
  return { name: "", specialty: "Outro" as ColumnistSpecialty, bio: "", avatar: "", active: true };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function ColumnistsManager() {
  const [columnists, setColumnists] = useState<Columnist[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [currentPage, setCurrentPage]   = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [dragOver, setDragOver]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 7;

  const load = async () => {
    setLoading(true);
    try { const data = await adminApi.getColumnists(); setColumnists(data.columnists); }
    catch { } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active   = columnists.filter((c) => c.active).length;
    const inactive = columnists.filter((c) => !c.active).length;
    const now      = new Date();
    const thisMonth = columnists.filter((c) => {
      const d = new Date(c.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { active, inactive, total: columnists.length, thisMonth };
  }, [columnists]);

  // ── Filtered + paginated ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = columnists;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        COLUMN_NAMES[c.specialty].toLowerCase().includes(q) ||
        c.specialty.toLowerCase().includes(q)
      );
    }
    if (statusFilter === "ativo")   list = list.filter((c) => c.active);
    if (statusFilter === "inativo") list = list.filter((c) => !c.active);
    return list;
  }, [columnists, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function toggleActive(c: Columnist) {
    try {
      const res = await adminApi.updateColumnist(c.id, { active: !c.active });
      setColumnists((prev) => prev.map((x) => x.id === c.id ? res.columnist : x));
    } catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este colunista?")) return;
    try {
      await adminApi.deleteColumnist(id);
      setColumnists((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
    } catch (err) { alert((err as Error).message); }
  }

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) { alert("Arquivo maior que 2MB."); return; }
    const b64 = await toBase64(file);
    setForm((f) => ({ ...f, avatar: b64 }));
  }

  function startEdit(c: Columnist) {
    setEditingId(c.id);
    setForm({ name: c.name, specialty: c.specialty, bio: c.bio, avatar: c.avatarBase64, active: c.active });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await adminApi.updateColumnist(editingId, {
          name: form.name, specialty: form.specialty, bio: form.bio,
          avatarBase64: form.avatar, active: form.active,
        });
        setColumnists((prev) => prev.map((c) => c.id === editingId ? res.columnist : c));
      } else {
        const res = await adminApi.createColumnist({
          name: form.name, specialty: form.specialty, bio: form.bio,
          avatarBase64: form.avatar, active: form.active,
        });
        setColumnists((prev) => [...prev, res.columnist]);
      }
      resetForm();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Colunistas">
      <div className="space-y-6">

        {/* ══ Stat cards ══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <UserCheck size={22} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Colunistas ativos</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.active}</p>
              </div>
            </div>
            {stats.thisMonth > 0 && (
              <p className="text-xs text-green-600 font-medium mt-3">+{stats.thisMonth} este mês</p>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <FileText size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total de colunistas</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.total}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">cadastrados no portal</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                <Users size={22} className="text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Especialidades</p>
                <p className="text-2xl font-bold text-[#0F172A]">
                  {new Set(columnists.map((c) => c.specialty)).size}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">categorias distintas</p>
          </div>

          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <UserX size={22} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Colunistas inativos</p>
                <p className="text-2xl font-bold text-[#0F172A]">{stats.inactive}</p>
              </div>
            </div>
            {stats.inactive > 0 && (
              <button
                onClick={() => setStatusFilter("inativo")}
                className="text-xs text-red-500 font-medium mt-3 hover:underline"
              >
                Ver lista
              </button>
            )}
          </div>
        </div>

        {/* ══ 2-column grid ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">

          {/* ── LEFT: table panel ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: CARD_SHADOW }}>

            {/* Filter bar */}
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar colunistas..."
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
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <button
                onClick={resetForm}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: "#E71D36" }}
              >
                <Plus size={16} />
                Novo colunista
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div className="py-16 text-center text-sm text-gray-400">Carregando colunistas…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">Nenhum colunista encontrado</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Colunista</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Coluna</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Especialidade</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((c, i) => {
                        const colors = SPECIALTY_COLORS[c.specialty];
                        return (
                          <tr
                            key={c.id}
                            className={`hover:bg-gray-50/50 transition-colors ${i < paginated.length - 1 ? "border-b border-gray-50" : ""} ${editingId === c.id ? "bg-blue-50/30" : ""}`}
                          >
                            {/* Colunista */}
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar src={c.avatarBase64} name={c.name} size={36} />
                                <div>
                                  <p className="font-medium text-[#0F172A] text-sm whitespace-nowrap">{c.name}</p>
                                  {c.bio && (
                                    <p className="text-xs text-gray-400 max-w-[160px] truncate">{c.bio}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            {/* Coluna */}
                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                              {COLUMN_NAMES[c.specialty]}
                            </td>
                            {/* Especialidade badge */}
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                                style={{ backgroundColor: colors.bg, color: colors.text }}
                              >
                                {c.specialty}
                              </span>
                            </td>
                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              {c.active ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                  Ativo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                                  Inativo
                                </span>
                              )}
                            </td>
                            {/* Ações */}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => startEdit(c)}
                                  title="Editar"
                                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                                    editingId === c.id
                                      ? "border-[#0B2A66] bg-[#0B2A66] text-white"
                                      : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-[#0B2A66]"
                                  }`}
                                >
                                  <Pencil size={13} />
                                </button>
                                <ToggleSwitch
                                  checked={c.active}
                                  onChange={() => { void toggleActive(c); }}
                                />
                                <button
                                  onClick={() => { void handleDelete(c.id); }}
                                  title="Excluir"
                                  className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-xs text-gray-500">
                    Mostrando {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} colunistas
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

          {/* ── RIGHT: form panel ──────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: CARD_SHADOW }}>
            <div className="mb-4">
              <h3 className="font-semibold text-[#0F172A]">
                {editingId ? "Editar colunista" : "Adicionar novo colunista"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {editingId ? "Atualize as informações do colunista." : "Preencha as informações para adicionar um novo colunista."}
              </p>
            </div>

            <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">

              {/* Avatar preview (when editing) */}
              {form.avatar && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <Avatar src={form.avatar} name={form.name || "?"} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{form.name || "Nome do colunista"}</p>
                    <p className="text-xs text-gray-500">{form.specialty}</p>
                  </div>
                </div>
              )}

              {/* Nome completo */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Carlos Andrade"
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
                />
              </div>

              {/* Coluna (especialidade) */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Coluna <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.specialty}
                  onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value as ColumnistSpecialty }))}
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 bg-white"
                >
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{COLUMN_NAMES[s]}</option>
                  ))}
                </select>
              </div>

              {/* Imagem do colunista */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Imagem do colunista <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleFile(f); } }}
                />
                {form.avatar ? (
                  <div className="relative rounded-xl border border-gray-200 overflow-hidden">
                    <img src={form.avatar} alt="Avatar" className="w-full max-h-28 object-contain bg-gray-50" />
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, avatar: "" }));
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:text-red-500"
                    >
                      <X size={12} />
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
                      if (f) { void handleFile(f); }
                    }}
                    onClick={() => fileRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-5 cursor-pointer transition-colors ${
                      dragOver ? "border-[#0B2A66] bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <Upload size={18} className={dragOver ? "text-[#0B2A66]" : "text-gray-400"} />
                    <p className="text-xs text-center text-gray-500 leading-relaxed">
                      Arraste e solte a imagem aqui<br />
                      <span className="text-[#0B2A66] font-medium">ou clique para selecionar</span>
                    </p>
                    <p className="text-[10px] text-gray-400">Formatos aceitos: JPG, PNG. Tamanho máximo: 2MB</p>
                  </div>
                )}
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Bio <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  placeholder="Breve descrição sobre o colunista..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] resize-none"
                />
                <p className="text-right text-[10px] text-gray-400 mt-0.5">{form.bio.length}/500</p>
              </div>

              {/* Status toggle */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm font-medium text-[#0F172A]">Status</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {form.active ? "Ativar colunista" : "Colunista inativo"}
                  </span>
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
                  onClick={resetForm}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "#E71D36" }}
                >
                  {saving ? "Salvando…" : editingId ? "Atualizar" : "Salvar colunista"}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </AdminLayout>
  );
}
