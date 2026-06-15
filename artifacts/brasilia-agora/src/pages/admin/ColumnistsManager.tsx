import React, { useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type Columnist, type ColumnistSpecialty } from "../../lib/adminApi";
import {
  Users, Plus, Trash2, Eye, EyeOff, ImageIcon, Pencil,
  CheckCircle, X, ChevronDown, RefreshCw,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

const SPECIALTIES: ColumnistSpecialty[] = [
  "Política", "Esporte", "Economia", "Cultura", "Segurança Pública", "Social", "Outro",
];

const SPECIALTY_COLORS: Record<ColumnistSpecialty, string> = {
  "Política":          "#1d4ed8",
  "Esporte":           "#dc2626",
  "Economia":          "#b45309",
  "Cultura":           "#0d9488",
  "Segurança Pública": "#7c3aed",
  "Social":            "#16a34a",
  "Outro":             "#6b7280",
};

function Avatar({ src, name, size = 56 }: { src: string; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover border-2 border-white shadow-sm shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gray-200 flex items-center justify-center shrink-0 border-2 border-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <span className="font-black text-gray-500" style={{ fontSize: size * 0.36 }}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// ─── Inline edit form ─────────────────────────────────────────────────────────

interface EditFormProps {
  columnist: Columnist;
  onSaved: (updated: Columnist) => void;
  onCancel: () => void;
}

function EditForm({ columnist, onSaved, onCancel }: EditFormProps) {
  const [name, setName]           = useState(columnist.name);
  const [bio, setBio]             = useState(columnist.bio);
  const [specialty, setSpecialty] = useState<ColumnistSpecialty>(columnist.specialty);
  const [avatar, setAvatar]       = useState(columnist.avatarBase64);
  const [saving, setSaving]       = useState(false);
  const fileRef                   = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setAvatar(await toBase64(f));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await adminApi.updateColumnist(columnist.id, {
        name: name.trim(),
        bio:  bio.trim(),
        specialty,
        avatarBase64: avatar,
      });
      onSaved(result.columnist);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const color = SPECIALTY_COLORS[specialty];

  return (
    <div className="border-t border-gray-100 mt-3 pt-4 space-y-4">

      {/* Avatar row */}
      <div className="flex items-center gap-4">
        <Avatar src={avatar} name={name || "?"} size={64} />
        <div className="flex-1">
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ImageIcon size={13} /> Trocar foto
          </button>
          {avatar && (
            <button
              type="button"
              onClick={() => setAvatar("")}
              className="mt-1 text-[11px] text-red-400 hover:text-red-600 flex items-center gap-1"
            >
              <X size={11} /> Remover foto
            </button>
          )}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nome completo</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]/25 focus:border-[#1a2448]"
          placeholder="Nome do colunista"
        />
      </div>

      {/* Specialty */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Especialidade</label>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALTIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpecialty(s)}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all"
              style={specialty === s
                ? { backgroundColor: SPECIALTY_COLORS[s] + "18", borderColor: SPECIALTY_COLORS[s], color: SPECIALTY_COLORS[s] }
                : { borderColor: "#e5e7eb", color: "#6b7280" }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Biografia</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2448]/25 focus:border-[#1a2448]"
          placeholder="Breve apresentação do colunista…"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-[2] flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: color }}
        >
          {saving
            ? <><RefreshCw size={13} className="animate-spin" /> Salvando…</>
            : <><CheckCircle size={13} /> Salvar alterações</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

interface AddFormProps {
  onAdded: (c: Columnist) => void;
  onClose: () => void;
}

function AddForm({ onAdded, onClose }: AddFormProps) {
  const [name, setName]           = useState("");
  const [bio, setBio]             = useState("");
  const [specialty, setSpecialty] = useState<ColumnistSpecialty>("Outro");
  const [avatar, setAvatar]       = useState("");
  const [saving, setSaving]       = useState(false);
  const fileRef                   = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setAvatar(await toBase64(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await adminApi.createColumnist({
        name: name.trim(), bio: bio.trim(), avatarBase64: avatar, active: true,
      });
      onAdded(result.columnist);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border-2 border-dashed border-[#1a2448]/30 p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-[#1a2448] flex items-center gap-2">
          <Plus size={15} /> Novo colunista
        </span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar src={avatar} name={name || "?"} size={56} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <ImageIcon size={13} /> {avatar ? "Trocar foto" : "Adicionar foto"}
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Nome completo *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2448]/25"
          placeholder="Nome do colunista" />
      </div>

      {/* Specialty */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Especialidade</label>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALTIES.map((s) => (
            <button key={s} type="button" onClick={() => setSpecialty(s)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all"
              style={specialty === s
                ? { backgroundColor: SPECIALTY_COLORS[s] + "18", borderColor: SPECIALTY_COLORS[s], color: SPECIALTY_COLORS[s] }
                : { borderColor: "#e5e7eb", color: "#6b7280" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Biografia</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2448]/25"
          placeholder="Breve apresentação…" />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={saving || !name.trim()}
          className="flex-[2] flex items-center justify-center gap-2 py-2 bg-[#1a2448] text-white rounded-lg text-sm font-semibold hover:bg-[#243060] disabled:opacity-50 transition-colors">
          {saving ? <><RefreshCw size={13} className="animate-spin" /> Criando…</> : <><CheckCircle size={13} /> Criar colunista</>}
        </button>
      </div>
    </form>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  columnist: Columnist;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSaved: (updated: Columnist) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function ColumnistCard({ columnist: c, isEditing, onToggleEdit, onSaved, onToggleActive, onDelete }: CardProps) {
  const color = SPECIALTY_COLORS[c.specialty] ?? "#6b7280";

  return (
    <div className={`bg-white rounded-xl border-2 shadow-sm transition-all
      ${isEditing ? "border-[#1a2448]/30 shadow-md" : "border-gray-200"}
      ${!c.active && !isEditing ? "opacity-50" : ""}
    `}>
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 p-4">
        <Avatar src={c.avatarBase64} name={c.name} size={52} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-[#1a2448] truncate text-sm">{c.name}</p>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: color + "18", color }}
            >
              {c.specialty}
            </span>
          </div>
          {c.bio && (
            <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
              {c.bio}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
              ${c.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {c.active ? "● Ativo" : "● Inativo"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleEdit}
            title={isEditing ? "Fechar edição" : "Editar colunista"}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors
              ${isEditing ? "border-[#1a2448] bg-[#1a2448] text-white" : "border-gray-200 text-gray-500 hover:border-[#1a2448] hover:text-[#1a2448]"}`}
          >
            {isEditing ? <ChevronDown size={14} /> : <Pencil size={13} />}
          </button>
          <button
            onClick={onToggleActive}
            title={c.active ? "Desativar" : "Ativar"}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
          >
            {c.active ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={onDelete}
            title="Excluir"
            className="w-8 h-8 rounded-lg border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Inline edit panel ── */}
      {isEditing && (
        <div className="px-4 pb-4">
          <EditForm
            columnist={c}
            onSaved={(updated) => { onSaved(updated); }}
            onCancel={onToggleEdit}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ColumnistsManager() {
  const [columnists, setColumnists] = useState<Columnist[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);

  const load = async () => {
    setLoading(true);
    try { const data = await adminApi.getColumnists(); setColumnists(data.columnists); }
    catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  function handleSaved(updated: Columnist) {
    setColumnists((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditingId(null);
  }

  function handleAdded(c: Columnist) {
    setColumnists((prev) => [...prev, c]);
    setShowAdd(false);
  }

  async function toggleActive(c: Columnist) {
    try {
      const result = await adminApi.updateColumnist(c.id, { active: !c.active });
      setColumnists((prev) => prev.map((x) => x.id === c.id ? result.columnist : x));
    } catch (err) { alert((err as Error).message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este colunista?")) return;
    try {
      await adminApi.deleteColumnist(id);
      setColumnists((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (err) { alert((err as Error).message); }
  }

  const activeCount = columnists.filter((c) => c.active).length;

  return (
    <AdminLayout title="Colunistas">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[#1a2448]">Colunistas</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading
                ? "Carregando…"
                : `${columnists.length} colunista${columnists.length !== 1 ? "s" : ""} · ${activeCount} ativo${activeCount !== 1 ? "s" : ""}`
              }
            </p>
          </div>
          <button
            onClick={() => { setShowAdd((s) => !s); setEditingId(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a2448] text-white rounded-xl text-sm font-semibold hover:bg-[#243060] transition-colors"
          >
            {showAdd ? <X size={15} /> : <Plus size={15} />}
            {showAdd ? "Fechar" : "Novo colunista"}
          </button>
        </div>

        {/* ── Add form ── */}
        {showAdd && (
          <AddForm
            onAdded={handleAdded}
            onClose={() => setShowAdd(false)}
          />
        )}

        {/* ── List ── */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Carregando colunistas…</div>
        ) : columnists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users size={36} className="mb-3 text-gray-300" />
            <p className="font-medium">Nenhum colunista cadastrado</p>
            <p className="text-xs mt-1">Clique em "Novo colunista" para adicionar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {columnists.map((c) => (
              <ColumnistCard
                key={c.id}
                columnist={c}
                isEditing={editingId === c.id}
                onToggleEdit={() => setEditingId(editingId === c.id ? null : c.id)}
                onSaved={handleSaved}
                onToggleActive={() => toggleActive(c)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
