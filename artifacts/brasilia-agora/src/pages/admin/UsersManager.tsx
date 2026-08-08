import React, { useState, useEffect, useMemo, useRef } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import {
  adminApi,
  type AdminUser, type UserRole, type UserPayload,
  type EditorPermission, type ColumnistSpecialty,
} from "../../lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, KeyRound, X, CheckCircle,
  UserCircle, ShieldCheck, ShieldOff, Search, RefreshCw,
  Eye, EyeOff, Lock, Unlock, PenLine, Upload, Loader2,
} from "lucide-react";

const CARD = "bg-white rounded-2xl overflow-hidden";
const CS   = { boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
const INPUT = "w-full border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] transition-colors";

type ModalMode = "create" | "edit" | "password" | null;
type ModalTab  = "dados" | "colunista" | "permissoes";

const SPECIALTIES: ColumnistSpecialty[] = [
  "Política", "Esporte", "Economia", "Cultura", "Segurança Pública", "Social", "Outro",
];

interface FormData {
  name: string; email: string; password: string; confirmPwd: string;
  role: UserRole; status: "active" | "inactive";
  bio: string; specialty: ColumnistSpecialty; avatarBase64: string;
}

const DEFAULT_FORM: FormData = {
  name: "", email: "", password: "", confirmPwd: "",
  role: "editor", status: "active",
  bio: "", specialty: "Outro", avatarBase64: "",
};

const ROLE_META: Record<UserRole, { label: string; bg: string; color: string; hint: string }> = {
  admin: {
    label: "Administrador", bg: "#EEF2FF", color: "#0B2A66",
    hint: "Acesso total ao painel. Não passa por permissões — por isso a aba fica desligada.",
  },
  editor: {
    label: "Editor", bg: "#FFF7ED", color: "#EA580C",
    hint: "Acesso ao que estiver liberado na aba Permissões deste usuário.",
  },
  columnist: {
    label: "Colunista", bg: "#F5F3FF", color: "#7C3AED",
    hint: "Enxerga e edita SÓ os artigos que assina. Nasce sem poder publicar — o texto vai para aprovação.",
  },
};

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

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

function RoleBadge({ role }: { role: UserRole }) {
  const meta = ROLE_META[role] ?? ROLE_META.editor;
  const Icon = role === "admin" ? ShieldCheck : role === "columnist" ? PenLine : ShieldOff;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon size={10} />
      {meta.label}
    </span>
  );
}

function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img src={src} alt={name} className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="rounded-full bg-[#EEF2FF] flex items-center justify-center text-[#0B2A66] font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials || "?"}
    </div>
  );
}

/* ── Sub-aba "Permissões" do modal ─────────────────────────────────────────
   Cada usuário tem o SEU conjunto (antes era uma chave única do perfil Editor,
   em Configurações → Permissões). Admin não aparece aqui: vê tudo por design. */
function PermissionsTab({
  role, permissions, onToggle, loading,
}: {
  role: UserRole;
  permissions: EditorPermission[];
  onToggle: (key: string, enabled: boolean) => void;
  loading: boolean;
}) {
  const groups = useMemo(
    () => [...new Set(permissions.map((p) => p.group))],
    [permissions],
  );

  if (role === "admin") {
    return (
      <div className="flex items-start gap-3 bg-[#EEF2FF] border border-[#C7D2FE] rounded-xl px-4 py-3">
        <ShieldCheck size={15} className="text-[#0B2A66] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[#0B2A66] leading-relaxed">
          Administrador tem acesso total por definição — não há o que restringir aqui.
          Troque o perfil para <strong>Editor</strong> ou <strong>Colunista</strong> para liberar item a item.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
        <Loader2 size={16} className="animate-spin" /> Carregando permissões…
      </div>
    );
  }

  const enabledCount = permissions.filter((p) => p.enabled).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          <strong className="text-slate-700">{enabledCount}</strong> de {permissions.length} liberadas
          {" · "}{ROLE_META[role].hint}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button"
            onClick={() => permissions.forEach((p) => { if (!p.enabled) onToggle(p.key, true); })}
            className="text-[11px] font-medium text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg">
            Tudo
          </button>
          <button type="button"
            onClick={() => permissions.forEach((p) => { if (p.enabled) onToggle(p.key, false); })}
            className="text-[11px] font-medium text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg">
            Nada
          </button>
        </div>
      </div>

      {groups.map((group) => {
        const items = permissions.filter((p) => p.group === group);
        const on = items.filter((p) => p.enabled).length;
        return (
          <div key={group} className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
              <span className="text-[12px] font-bold text-slate-700">{group}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-500">{on}/{items.length}</span>
                <button type="button"
                  onClick={() => items.forEach((p) => onToggle(p.key, on < items.length))}
                  className="text-[10px] font-medium text-[#0B2A66] hover:underline">
                  {on < items.length ? "ativar grupo" : "limpar grupo"}
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {items.map((p) => (
                <label key={p.key}
                  className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50/60">
                  <span className="flex items-start gap-2 min-w-0">
                    {p.enabled
                      ? <Unlock size={12} className="text-green-500 shrink-0 mt-0.5" />
                      : <Lock size={12} className="text-slate-300 shrink-0 mt-0.5" />}
                    <span className="min-w-0">
                      <span className={`block text-[13px] ${p.enabled ? "text-slate-800 font-medium" : "text-slate-500"}`}>
                        {p.label}
                      </span>
                      <span className="block text-[11px] text-slate-400">{p.description}</span>
                    </span>
                  </span>
                  <button type="button"
                    onClick={() => onToggle(p.key, !p.enabled)}
                    aria-label={p.enabled ? `Desativar ${p.label}` : `Ativar ${p.label}`}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${p.enabled ? "bg-green-500" : "bg-slate-300"}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.enabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function UsersManager() {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<ModalMode>(null);
  const [tab, setTab]             = useState<ModalTab>("dados");
  const [editUser, setEditUser]   = useState<AdminUser | null>(null);
  const [form, setForm]           = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving]       = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showPwd2, setShowPwd2]   = useState(false);
  const [perms, setPerms]         = useState<EditorPermission[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
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

  /** Carrega o conjunto do usuário (edição) ou o modelo do perfil (criação). */
  async function loadPermissions(user: AdminUser | null, role: UserRole) {
    if (role === "admin") { setPerms([]); return; }
    setPermsLoading(true);
    try {
      const data = user
        ? await adminApi.getUserPermissions(user.id)
        : await adminApi.getEditorPermissions(role);
      setPerms(data.permissions);
    } catch (err) {
      toast({ title: "Erro ao carregar permissões", description: String(err), variant: "destructive" });
      setPerms([]);
    } finally {
      setPermsLoading(false);
    }
  }

  function openCreate() {
    setEditUser(null);
    setForm(DEFAULT_FORM);
    setTab("dados");
    setModal("create");
    void loadPermissions(null, DEFAULT_FORM.role);
  }

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setForm({
      name: u.name, email: u.email, password: "", confirmPwd: "",
      role: u.role, status: u.status === "blocked" ? "inactive" : u.status,
      bio: "", specialty: "Outro", avatarBase64: u.avatarBase64 ?? "",
    });
    setTab("dados");
    setModal("edit");
    void loadPermissions(u, u.role);
    // Bio/coluna vivem no perfil de colunista, não no usuário — busca só quando há um.
    if (u.columnistId) {
      void adminApi.getColumnist(u.columnistId)
        .then(({ columnist }) => setForm((f) => ({
          ...f, bio: columnist.bio, specialty: columnist.specialty,
          avatarBase64: f.avatarBase64 || columnist.avatarBase64,
        })))
        .catch(() => {});
    }
  }

  function openPassword(u: AdminUser) {
    setEditUser(u);
    setForm({ ...DEFAULT_FORM, name: u.name });
    setModal("password");
  }

  function closeModal() {
    setModal(null); setEditUser(null); setShowPwd(false); setShowPwd2(false);
    setPerms([]); setTab("dados");
  }

  function changeRole(role: UserRole) {
    setForm((f) => ({ ...f, role }));
    if (role === "admin") { setPerms([]); return; }
    // Perfil novo → recarrega o modelo dele; na edição mantém o que o usuário já tem.
    void loadPermissions(editUser && editUser.role === role ? editUser : null, role);
  }

  function togglePerm(key: string, enabled: boolean) {
    setPerms((prev) => prev.map((p) => (p.key === key ? { ...p, enabled } : p)));
  }

  async function pickAvatar(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem maior que 2MB", variant: "destructive" }); return;
    }
    const b64 = await toBase64(file);
    setForm((f) => ({ ...f, avatarBase64: b64 }));
  }

  function columnistPayload(): Pick<UserPayload, "bio" | "specialty" | "avatarBase64"> {
    if (form.role !== "columnist") {
      return form.avatarBase64 ? { avatarBase64: form.avatarBase64 } : {};
    }
    return { bio: form.bio, specialty: form.specialty, avatarBase64: form.avatarBase64 };
  }

  async function handleSave() {
    const enabledKeys = perms.filter((p) => p.enabled).map((p) => p.key);

    if (modal === "create") {
      if (!form.name || !form.email || !form.password) {
        toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
        setTab("dados"); return;
      }
      if (form.password !== form.confirmPwd) {
        toast({ title: "As senhas não coincidem", variant: "destructive" });
        setTab("dados"); return;
      }
      setSaving(true);
      try {
        await adminApi.createUser({
          name: form.name, email: form.email, password: form.password,
          role: form.role, status: form.status,
          ...(form.role === "admin" ? {} : { permissions: enabledKeys }),
          ...columnistPayload(),
        });
        toast({ title: "Usuário criado com sucesso!" });
        closeModal(); await loadUsers();
      } catch (err) {
        toast({ title: "Erro ao criar usuário", description: String(err), variant: "destructive" });
      } finally { setSaving(false); }

    } else if (modal === "edit" && editUser) {
      setSaving(true);
      try {
        await adminApi.updateUser(editUser.id, {
          name: form.name, email: form.email, role: form.role, status: form.status,
          ...(form.role === "admin" ? {} : { permissions: enabledKeys }),
          ...columnistPayload(),
        });
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

  const modalTabs: { id: ModalTab; label: string }[] = [
    { id: "dados", label: "Dados" },
    ...(form.role === "columnist" ? [{ id: "colunista" as const, label: "Colunista" }] : []),
    { id: "permissoes", label: "Permissões" },
  ];

  return (
    <AdminLayout title="Usuários e Permissões">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0B2A66]">Usuários e Permissões</h2>
            <p className="text-sm text-slate-500 mt-1">
              Cada usuário tem o seu próprio conjunto de permissões, editado no modal dele.
            </p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B2A66] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus size={16} /> Novo Usuário
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total de Usuários", value: users.length, color: "#0B2A66", bg: "#EEF2FF" },
            { label: "Administradores",   value: users.filter((u) => u.role === "admin").length,     color: "#16A34A", bg: "#DCFCE7" },
            { label: "Editores",          value: users.filter((u) => u.role === "editor").length,    color: "#EA580C", bg: "#FFF7ED" },
            { label: "Colunistas",        value: users.filter((u) => u.role === "columnist").length, color: "#7C3AED", bg: "#F5F3FF" },
          ].map((s) => (
            <div key={s.label} className={`${CARD} p-5 flex items-center gap-4`} style={CS}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: s.bg }}>
                <UserCircle size={22} style={{ color: s.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-slate-500 truncate">{s.label}</p>
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
                          <Avatar src={u.avatarBase64} name={u.name} />
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
                          <button onClick={() => openEdit(u)} title="Editar (dados e permissões)"
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
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800">
                {modal === "create" ? "Novo Usuário" : modal === "edit" ? "Editar Usuário" : "Alterar Senha"}
              </h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>

            {/* Sub-abas — permissões agora moram aqui, não em Configurações */}
            {modal !== "password" && (
              <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 shrink-0">
                {modalTabs.map((tb) => (
                  <button key={tb.id} onClick={() => setTab(tb.id)}
                    className={`px-3 py-2 text-[13px] font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                      tab === tb.id
                        ? "border-[#0B2A66] text-[#0B2A66]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}>
                    {tb.label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6 space-y-4 overflow-y-auto">
              {modal !== "password" && tab === "dados" && (
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
                      <select className={INPUT} value={form.role} onChange={(e) => changeRole(e.target.value as UserRole)}>
                        <option value="editor">Editor</option>
                        <option value="columnist">Colunista</option>
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
                  <p className="text-[11px] text-slate-400 leading-relaxed">{ROLE_META[form.role].hint}</p>

                  {modal === "create" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Senha *</label>
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
                </>
              )}

              {modal !== "password" && tab === "colunista" && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <Avatar src={form.avatarBase64} name={form.name || "?"} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{form.name || "Nome do colunista"}</p>
                      <p className="text-[11px] text-slate-500">
                        É esta foto e este nome que assinam os artigos no site.
                      </p>
                    </div>
                  </div>
                  <input ref={avatarRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); }} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => avatarRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
                      <Upload size={14} /> {form.avatarBase64 ? "Trocar foto" : "Enviar foto"}
                    </button>
                    {form.avatarBase64 && (
                      <button type="button" onClick={() => setForm((f) => ({ ...f, avatarBase64: "" }))}
                        className="px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 rounded-xl">
                        Remover
                      </button>
                    )}
                    <span className="text-[10px] text-slate-400">JPG ou PNG, até 2MB</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Coluna</label>
                    <select className={INPUT} value={form.specialty}
                      onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value as ColumnistSpecialty }))}>
                      {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Bio</label>
                    <textarea className={`${INPUT} resize-none`} rows={3} maxLength={500} value={form.bio}
                      onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Breve descrição exibida na assinatura do artigo…" />
                    <p className="text-right text-[10px] text-slate-400 mt-0.5">{form.bio.length}/500</p>
                  </div>
                </>
              )}

              {modal !== "password" && tab === "permissoes" && (
                <PermissionsTab role={form.role} permissions={perms} onToggle={togglePerm} loading={permsLoading} />
              )}

              {modal === "password" && (
                <>
                  <p className="text-sm text-slate-500">Alterar senha de <strong>{editUser?.name}</strong></p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nova Senha *</label>
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

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
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
