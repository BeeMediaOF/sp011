import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi, type AdminUser } from "../../lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, KeyRound, X, CheckCircle,
  UserCircle, ShieldCheck, ShieldOff, Search, RefreshCw,
  Eye, EyeOff,
} from "lucide-react";

const CARD = "bg-white rounded-2xl overflow-hidden";
const CS   = { boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const INPUT = "w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

type ModalMode = "create" | "edit" | "password" | null;

interface FormData {
  name: string; email: string; password: string; confirmPwd: string;
  role: "admin" | "editor"; status: "active" | "inactive";
}

const DEFAULT_FORM: FormData = { name: "", email: "", password: "", confirmPwd: "", role: "editor", status: "active" };

function StatusBadge({ status }: { status: AdminUser["status"] }) {
  const cfg = {
    active:   { label: "Ativo",     bg: "#DCFCE7", color: "#16A34A" },
    inactive: { label: "Inativo",   bg: "#F1F5F9", color: "#64748B" },
    blocked:  { label: "Bloqueado", bg: "#FEE2E2", color: "#DC2626" },
  }[status] ?? { label: status, bg: "#F1F5F9", color: "#64748B" };
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  const isAdmin = role === "admin";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isAdmin ? "bg-[#EEF2FF] text-[#0B2A66]" : "bg-[#FFF7ED] text-[#EA580C]"}`}>
      {isAdmin ? <ShieldCheck size={10} /> : <ShieldOff size={10} />}
      {isAdmin ? "Admin" : "Editor"}
    </span>
  );
}

export default function UsersManager() {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<ModalMode>(null);
  const [editUser, setEditUser]   = useState<AdminUser | null>(null);
  const [form, setForm]           = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving]       = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showPwd2, setShowPwd2]   = useState(false);
  const { toast } = useToast();

  async function loadUsers() {
    setLoading(true);
    try {
      const { users: u } = await adminApi.getUsers();
      setUsers(u);
    } catch (err) {
      toast({ title: "Erro ao carregar usuários", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  function openCreate() {
    setEditUser(null);
    setForm(DEFAULT_FORM);
    setModal("create");
  }

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", confirmPwd: "", role: u.role, status: u.status === "blocked" ? "inactive" : u.status });
    setModal("edit");
  }

  function openPassword(u: AdminUser) {
    setEditUser(u);
    setForm({ ...DEFAULT_FORM, name: u.name });
    setModal("password");
  }

  function closeModal() { setModal(null); setEditUser(null); setShowPwd(false); setShowPwd2(false); }

  async function handleSave() {
    if (modal === "create") {
      if (!form.name || !form.email || !form.password) {
        toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" }); return;
      }
      if (form.password !== form.confirmPwd) {
        toast({ title: "As senhas não coincidem", variant: "destructive" }); return;
      }
      setSaving(true);
      try {
        await adminApi.createUser({ name: form.name, email: form.email, password: form.password, role: form.role, status: form.status });
        toast({ title: "Usuário criado com sucesso!" });
        closeModal(); await loadUsers();
      } catch (err) {
        toast({ title: "Erro ao criar usuário", description: String(err), variant: "destructive" });
      } finally { setSaving(false); }

    } else if (modal === "edit" && editUser) {
      setSaving(true);
      try {
        await adminApi.updateUser(editUser.id, { name: form.name, email: form.email, role: form.role, status: form.status });
        toast({ title: "Usuário atualizado!" });
        closeModal(); await loadUsers();
      } catch (err) {
        toast({ title: "Erro ao atualizar usuário", description: String(err), variant: "destructive" });
      } finally { setSaving(false); }

    } else if (modal === "password" && editUser) {
      if (!form.password || form.password.length < 6) {
        toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" }); return;
      }
      if (form.password !== form.confirmPwd) {
        toast({ title: "As senhas não coincidem", variant: "destructive" }); return;
      }
      setSaving(true);
      try {
        await adminApi.changeUserPassword(editUser.id, form.password);
        toast({ title: "Senha alterada com sucesso!" });
        closeModal();
      } catch (err) {
        toast({ title: "Erro ao alterar senha", description: String(err), variant: "destructive" });
      } finally { setSaving(false); }
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!confirm(`Excluir o usuário "${u.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminApi.deleteUser(u.id);
      toast({ title: "Usuário excluído" });
      await loadUsers();
    } catch (err) {
      toast({ title: "Erro ao excluir usuário", description: String(err), variant: "destructive" });
    }
  }

  async function toggleStatus(u: AdminUser) {
    const newStatus: "active" | "inactive" = u.status === "active" ? "inactive" : "active";
    try {
      await adminApi.updateUser(u.id, { status: newStatus });
      await loadUsers();
    } catch (err) {
      toast({ title: "Erro ao atualizar status", description: String(err), variant: "destructive" });
    }
  }

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <AdminLayout title="Usuários e Permissões">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0B2A66]">Usuários e Permissões</h2>
            <p className="text-sm text-slate-500 mt-1">Gerencie os usuários e perfis de acesso da plataforma</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus size={16} /> Novo Usuário
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total de Usuários", value: users.length, color: "#0B2A66", bg: "#EEF2FF" },
            { label: "Administradores",   value: users.filter((u) => u.role === "admin").length,  color: "#16A34A", bg: "#DCFCE7" },
            { label: "Editores",          value: users.filter((u) => u.role === "editor").length, color: "#EA580C", bg: "#FFF7ED" },
          ].map((s) => (
            <div key={s.label} className={`${CARD} p-5 flex items-center gap-4`} style={CS}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.bg }}>
                <UserCircle size={22} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className={CARD} style={CS}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Lista de Usuários</h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar usuário..."
                  className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0B2A66]"
                />
              </div>
              <button onClick={loadUsers} className="p-1.5 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-slate-50">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400">Carregando usuários...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">Nenhum usuário encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Usuário</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Perfil</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Criação</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Último Acesso</th>
                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#EEF2FF] flex items-center justify-center text-[#0B2A66] text-xs font-bold">
                            {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-4"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-4 text-[12px] text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-4 text-[12px] text-slate-500">{formatDate(u.lastLogin)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => toggleStatus(u)} title={u.status === "active" ? "Desativar" : "Ativar"}
                            className={`p-1.5 rounded-lg transition-colors ${u.status === "active" ? "text-green-600 hover:bg-green-50" : "text-slate-400 hover:bg-slate-100"}`}>
                            <CheckCircle size={14} />
                          </button>
                          <button onClick={() => openEdit(u)} title="Editar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-[#EEF2FF] transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => openPassword(u)} title="Alterar senha"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <KeyRound size={14} />
                          </button>
                          <button onClick={() => handleDelete(u)} title="Excluir"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">
                {modal === "create" ? "Novo Usuário" : modal === "edit" ? "Editar Usuário" : "Alterar Senha"}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>

            <div className="p-6 space-y-4">
              {modal !== "password" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nome *</label>
                    <input className={INPUT} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">E-mail *</label>
                    <input className={INPUT} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Perfil</label>
                      <select className={INPUT} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "editor" }))}>
                        <option value="editor">Editor</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                      <select className={INPUT} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}>
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {(modal === "create" || modal === "password") && (
                <>
                  {modal === "password" && (
                    <p className="text-sm text-slate-500">Alterar senha de <strong>{editUser?.name}</strong></p>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {modal === "create" ? "Senha *" : "Nova Senha *"}
                    </label>
                    <div className="relative">
                      <input className={INPUT} type={showPwd ? "text" : "password"} value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres" />
                      <button type="button" onClick={() => setShowPwd((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar Senha *</label>
                    <div className="relative">
                      <input className={INPUT} type={showPwd2 ? "text" : "password"} value={form.confirmPwd}
                        onChange={(e) => setForm((f) => ({ ...f, confirmPwd: e.target.value }))}
                        placeholder="Repita a senha" />
                      <button type="button" onClick={() => setShowPwd2((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {showPwd2 ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-[#0B2A66] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-60 transition-opacity">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
