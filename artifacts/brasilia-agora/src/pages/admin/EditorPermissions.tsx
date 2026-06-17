import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/adminApi";
import type { EditorPermission } from "@/lib/adminApi";
import {
  Shield, ShieldCheck, ShieldOff, Save, RefreshCw,
  FileText, LayoutDashboard, Settings, Zap, Lock, Unlock,
  ChevronDown, ChevronRight,
} from "lucide-react";

const GROUP_ICONS: Record<string, React.ElementType> = {
  "Conteúdo":      FileText,
  "Plataforma":    LayoutDashboard,
  "Automações":    Zap,
  "Administração": Settings,
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
  "Conteúdo":      "Permissões relacionadas a artigos, imagens e publicação de conteúdo.",
  "Plataforma":    "Acesso aos módulos principais do painel administrativo.",
  "Automações":    "Fontes RSS, redes sociais, colunistas e publicação automática.",
  "Administração": "Configurações avançadas, usuários e logs do sistema.",
};

function PermissionToggle({
  permission,
  onChange,
  saving,
}: {
  permission: EditorPermission;
  onChange: (key: string, enabled: boolean) => void;
  saving: string | null;
}) {
  const isSaving = saving === permission.key;

  return (
    <div
      className={`flex items-center justify-between py-3 px-4 rounded-xl transition-all ${
        permission.enabled ? "bg-green-50/60 border border-green-100" : "bg-slate-50 border border-slate-100"
      }`}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          {permission.enabled ? (
            <Unlock size={13} className="text-green-500 shrink-0" />
          ) : (
            <Lock size={13} className="text-slate-400 shrink-0" />
          )}
          <span className={`text-sm font-medium ${permission.enabled ? "text-slate-800" : "text-slate-500"}`}>
            {permission.label}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5 pl-5">{permission.description}</p>
      </div>

      <button
        onClick={() => onChange(permission.key, !permission.enabled)}
        disabled={isSaving}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 focus:outline-none disabled:opacity-70 ${
          permission.enabled ? "bg-green-500" : "bg-slate-300"
        }`}
        aria-label={permission.enabled ? "Desativar" : "Ativar"}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            permission.enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
        {isSaving && (
          <span className="absolute inset-0 flex items-center justify-center">
            <RefreshCw size={10} className="text-white animate-spin" />
          </span>
        )}
      </button>
    </div>
  );
}

function GroupCard({
  group,
  permissions,
  onChange,
  saving,
}: {
  group: string;
  permissions: EditorPermission[];
  onChange: (key: string, enabled: boolean) => void;
  saving: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const GroupIcon = GROUP_ICONS[group] ?? Shield;
  const enabledCount = permissions.filter((p) => p.enabled).length;

  function toggleAll(enable: boolean) {
    permissions.forEach((p) => {
      if (p.enabled !== enable) onChange(p.key, enable);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] flex items-center justify-center shrink-0">
          <GroupIcon size={17} className="text-[#0B2A66]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">{group}</h3>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              enabledCount === permissions.length
                ? "bg-green-100 text-green-700"
                : enabledCount === 0
                ? "bg-slate-100 text-slate-500"
                : "bg-amber-100 text-amber-700"
            }`}>
              {enabledCount}/{permissions.length} ativas
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{GROUP_DESCRIPTIONS[group]}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); toggleAll(true); }}
            className="text-[11px] font-medium text-green-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
          >
            Ativar todas
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleAll(false); }}
            className="text-[11px] font-medium text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            Desativar todas
          </button>
          {expanded ? (
            <ChevronDown size={15} className="text-slate-400" />
          ) : (
            <ChevronRight size={15} className="text-slate-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-4 space-y-2 border-t border-slate-50 pt-3">
          {permissions.map((p) => (
            <PermissionToggle key={p.key} permission={p} onChange={onChange} saving={saving} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorPermissions() {
  const [permissions, setPermissions] = useState<EditorPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getEditorPermissions();
      setPermissions(data.permissions);
    } catch (e) {
      setError((e as Error).message ?? "Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleToggle(key: string, enabled: boolean) {
    setSaving(key);
    setPermissions((prev) =>
      prev.map((p) => (p.key === key ? { ...p, enabled } : p)),
    );
    try {
      await adminApi.setEditorPermission(key, enabled);
      showToast(
        enabled
          ? `Permissão "${permissions.find((p) => p.key === key)?.label}" ativada`
          : `Permissão "${permissions.find((p) => p.key === key)?.label}" desativada`,
      );
    } catch (e) {
      setPermissions((prev) =>
        prev.map((p) => (p.key === key ? { ...p, enabled: !enabled } : p)),
      );
      showToast((e as Error).message ?? "Erro ao salvar", "error");
    } finally {
      setSaving(null);
    }
  }

  const groups = [...new Set(permissions.map((p) => p.group))];
  const totalEnabled = permissions.filter((p) => p.enabled).length;

  return (
    <AdminLayout title="Permissões do Editor">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header card */}
        <div className="bg-[#0B2A66] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
            <Shield size={96} />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck size={22} className="text-blue-200" />
            <h2 className="text-lg font-bold">Controle de Permissões</h2>
          </div>
          <p className="text-sm text-blue-200 leading-relaxed max-w-lg">
            Defina exatamente o que cada Editor pode acessar na plataforma.
            As alterações têm efeito imediato e são registradas nos logs de auditoria.
          </p>
          {!loading && (
            <div className="mt-4 flex items-center gap-4">
              <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                <div className="text-2xl font-bold">{totalEnabled}</div>
                <div className="text-[10px] text-blue-200 mt-0.5">Permissões ativas</div>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                <div className="text-2xl font-bold">{permissions.length - totalEnabled}</div>
                <div className="text-[10px] text-blue-200 mt-0.5">Bloqueadas</div>
              </div>
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <ShieldOff size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 leading-relaxed">
            <strong>Validação em 3 camadas:</strong> O menu lateral, as páginas do painel e o
            backend bloqueiam automaticamente qualquer acesso não autorizado.
            O Editor receberá a mensagem: <em>"Acesso restrito. O administrador não liberou esta função para o seu perfil."</em>
          </p>
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Carregando permissões...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <ShieldOff size={15} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="ml-auto text-[12px] font-medium text-red-600 hover:underline">
              Tentar novamente
            </button>
          </div>
        )}

        {/* Permission groups */}
        {!loading && !error && groups.map((group) => (
          <GroupCard
            key={group}
            group={group}
            permissions={permissions.filter((p) => p.group === group)}
            onChange={handleToggle}
            saving={saving}
          />
        ))}

        {/* Audit note */}
        {!loading && !error && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
            <Save size={12} />
            <span>Todas as alterações são salvas imediatamente e registradas nos logs de auditoria.</span>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white z-50 transition-all ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>
          {toast.type === "success" ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
          {toast.msg}
        </div>
      )}
    </AdminLayout>
  );
}
