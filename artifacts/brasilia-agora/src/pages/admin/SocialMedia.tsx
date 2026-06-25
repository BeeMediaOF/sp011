import React, { useState, useEffect, useRef, useCallback } from "react";
import { BRAND } from "../../brand";
import {
  Share2, Plus, Trash2, Pencil, CheckCircle, AlertCircle, Loader2, X,
  Play, RefreshCw, ChevronDown, ChevronUp, Image as ImageIcon, Type,
  AlignLeft, AlignCenter, AlignRight, Layers, Save,
  Instagram, Facebook, Clock, Send, Link2, TestTube2, ToggleLeft, ToggleRight,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialAccount {
  id: string;
  name: string;
  metaAppId?: string | null;
  metaAppSecret?: string | null;
  pageId?: string | null;
  pageName?: string | null;
  instagramId?: string | null;
  instagramName?: string | null;
  accessToken?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TemplateElement {
  id: string;
  type: "title" | "category" | "image" | "logo" | "cta" | "text";
  x: number; y: number;
  width: number; height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  padding: number;
  borderRadius: number;
  opacity: number;
  zIndex: number;
  content: string;
  objectFit?: "cover" | "contain" | "fill";
}

interface SocialTemplate {
  id: string;
  name: string;
  type: "feed" | "story";
  width: number;
  height: number;
  backgroundColor: string;
  elements: TemplateElement[];
}

interface QueueItem {
  id: string;
  articleId: string;
  articleTitle?: string | null;
  socialAccountId: string;
  accountName?: string | null;
  templateId?: string | null;
  type: string;
  status: string;
  caption?: string | null;
  scheduledAt: string;
  publishedAt?: string | null;
  metaPostId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  createdAt: string;
}

interface ArticleOption { id: string; title: string; category: string; imageUrl?: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const PRIMARY = "#0B2A66";
const ACCENT  = "#E71D36";

const PREVIEW_W = 360;
const ACTUAL_W  = 1080;
const SCALE = PREVIEW_W / ACTUAL_W;

const FONT_FAMILIES = ["Inter", "Georgia", "Arial", "Merriweather", "Roboto", "Oswald"];
const ELEMENT_TYPE_LABELS: Record<string, string> = {
  title: "Título", category: "Categoria", image: "Imagem de fundo",
  logo: "Logo", cta: "Call to action", text: "Texto livre",
};

function makeElement(type: TemplateElement["type"]): TemplateElement {
  const overrides: Record<string, Partial<TemplateElement>> = {
    title:    { x: 40, y: 600, width: 1000, height: 200, fontSize: 64, fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", content: "{{title}}" },
    category: { x: 40, y: 540, width: 300,  height: 60,  fontSize: 28, fontWeight: "bold", color: "#ffffff", backgroundColor: ACCENT, content: "{{category}}" },
    image:    { x: 0,  y: 0,   width: 1080, height: 800, fontSize: 0,  fontWeight: "normal", color: "", backgroundColor: "#333333", content: "", objectFit: "cover" },
    logo:     { x: 40, y: 40,  width: 200,  height: 80,  fontSize: 0,  fontWeight: "normal", color: "", backgroundColor: "transparent", content: "", objectFit: "contain" },
    cta:      { x: 40, y: 900, width: 400,  height: 80,  fontSize: 28, fontWeight: "bold", color: "#ffffff", backgroundColor: PRIMARY, content: "Leia mais →" },
    text:     { x: 40, y: 1100, width: 1000, height: 80, fontSize: 24, fontWeight: "normal", color: "#cccccc", backgroundColor: "transparent", content: "sbcagora.com.br" },
  };
  return {
    id: crypto.randomUUID(),
    type,
    x: 40, y: 400, width: 600, height: 100,
    fontSize: 32, fontFamily: "Inter", fontWeight: "normal",
    color: "#ffffff", backgroundColor: "transparent",
    textAlign: "left", padding: 16, borderRadius: 0, opacity: 1, zIndex: 1,
    content: "",
    ...(overrides[type] ?? {}),
  };
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/admin/social${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  return res.json() as Promise<unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MODAL — simplified: Name + App ID + App Secret as primary fields
// ═══════════════════════════════════════════════════════════════════════════════

function AccountModal({
  editingAccount,
  setEditingAccount,
  accountSaving,
  onSave,
  onClose,
}: {
  editingAccount: Partial<SocialAccount & { accessToken: string }>;
  setEditingAccount: React.Dispatch<React.SetStateAction<Partial<SocialAccount & { accessToken: string }> | null>>;
  accountSaving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(
    !!(editingAccount.pageId || editingAccount.instagramId || editingAccount.accessToken)
  );

  const Field = ({ fieldKey, label, placeholder, pw = false }: { fieldKey: string; label: string; placeholder: string; pw?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{label}</label>
      <input
        type={pw ? "password" : "text"}
        value={(editingAccount[fieldKey as keyof typeof editingAccount] as string) ?? ""}
        onChange={(e) => setEditingAccount((prev) => prev ? { ...prev, [fieldKey]: e.target.value } : prev)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] bg-slate-50"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            {editingAccount.id ? "Editar Conta" : "Adicionar Conta Meta"}
          </h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* ── Campos principais ── */}
          <Field fieldKey="name" label="Nome da conta *" placeholder={`Ex: ${BRAND.name}`} />
          <Field fieldKey="metaAppId" label="ID do Aplicativo Meta" placeholder="123456789012345" />
          <Field fieldKey="metaAppSecret" label="Chave Secreta do App" placeholder="••••••••••••••••" pw />

          {/* ── Avançado ── */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#0B2A66] hover:underline"
            >
              {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAdvanced ? "Ocultar campos avançados" : "Configuração avançada (Page ID, Instagram, Token)"}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Preencha o <strong>Page Access Token</strong> com um token de longa duração obtido no Meta Business Suite
                ou pelo fluxo OAuth. O Page ID e o Instagram ID são preenchidos automaticamente ao testar a conexão.
              </p>
              <Field fieldKey="accessToken" label="Page Access Token (long-lived)" placeholder="EAABxx…" pw />
              <Field fieldKey="pageId" label="Facebook Page ID" placeholder="123456789012345" />
              <Field fieldKey="pageName" label="Nome da Página (opcional)" placeholder={BRAND.name} />
              <Field fieldKey="instagramId" label="Instagram Business Account ID" placeholder="123456789012345" />
              <Field fieldKey="instagramName" label="Nome do Instagram (opcional)" placeholder="@sbcagora" />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editingAccount.isActive ?? true}
              onChange={(e) => setEditingAccount((prev) => prev ? { ...prev, isActive: e.target.checked } : prev)} />
            <span className="text-sm text-slate-700">Conta ativa</span>
          </label>
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <button onClick={onSave} disabled={accountSaving || !editingAccount.name}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: PRIMARY }}>
            {accountSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {accountSaving ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SocialMedia() {
  const [tab, setTab] = useState<"accounts" | "templates" | "queue">("accounts");

  // ── Accounts ──────────────────────────────────────────────────────────────
  const [accounts,         setAccounts]         = useState<SocialAccount[]>([]);
  const [accountsLoading,  setAccountsLoading]  = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount,   setEditingAccount]   = useState<Partial<SocialAccount & { accessToken: string }> | null>(null);
  const [accountSaving,    setAccountSaving]    = useState(false);
  const [testStatus,       setTestStatus]       = useState<Record<string, { ok: boolean; msg: string } | null>>({});
  const [testingId,        setTestingId]        = useState<string | null>(null);

  // ── Templates ─────────────────────────────────────────────────────────────
  const [templates,       setTemplates]       = useState<SocialTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<SocialTemplate | null>(null);
  const [selectedElId,    setSelectedElId]    = useState<string | null>(null);
  const [templateSaving,  setTemplateSaving]  = useState(false);
  const [templateSaved,   setTemplateSaved]   = useState(false);
  const [dragging, setDragging] = useState<{
    id: string; startX: number; startY: number; origX: number; origY: number;
  } | null>(null);

  // ── Queue ─────────────────────────────────────────────────────────────────
  const [queue,          setQueue]          = useState<QueueItem[]>([]);
  const [queueLoading,   setQueueLoading]   = useState(false);
  const [queueFilter,    setQueueFilter]    = useState("all");
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [articles,       setArticles]       = useState<ArticleOption[]>([]);
  const [processing,     setProcessing]     = useState(false);
  const [articleSearch,  setArticleSearch]  = useState("");
  const [queueForm, setQueueForm] = useState({
    articleId: "",
    accountIds: [] as string[],
    templateFeedId: "",
    templateStoryId: "",
    caption: "",
    types: ["feed"] as string[],
    scheduledAt: "",
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try { setAccounts((await apiFetch("/accounts")) as SocialAccount[]); } finally { setAccountsLoading(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setTemplates((await apiFetch("/templates")) as SocialTemplate[]);
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const qs = queueFilter !== "all" ? `?status=${queueFilter}` : "";
      setQueue((await apiFetch(`/queue${qs}`)) as QueueItem[]);
    } finally { setQueueLoading(false); }
  }, [queueFilter]);

  useEffect(() => { void fetchAccounts(); void fetchTemplates(); }, [fetchAccounts, fetchTemplates]);
  useEffect(() => { if (tab === "queue") void fetchQueue(); }, [tab, fetchQueue]);
  useEffect(() => { if (tab === "queue") void fetchQueue(); }, [queueFilter]);

  // ── Drag ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragging.startX) / SCALE;
      const dy = (e.clientY - dragging.startY) / SCALE;
      setCurrentTemplate((prev) => prev ? {
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === dragging.id
            ? { ...el, x: Math.round(dragging.origX + dx), y: Math.round(dragging.origY + dy) }
            : el,
        ),
      } : prev);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  // ── Account ops ───────────────────────────────────────────────────────────

  async function saveAccount() {
    if (!editingAccount?.name) return;
    setAccountSaving(true);
    try {
      if (editingAccount.id) {
        await apiFetch(`/accounts/${editingAccount.id}`, { method: "PUT", body: JSON.stringify(editingAccount) });
      } else {
        await apiFetch("/accounts", { method: "POST", body: JSON.stringify(editingAccount) });
      }
      setShowAccountModal(false); setEditingAccount(null);
      await fetchAccounts();
    } finally { setAccountSaving(false); }
  }

  async function deleteAccount(id: string) {
    if (!window.confirm("Remover esta conta?")) return;
    await apiFetch(`/accounts/${id}`, { method: "DELETE" });
    await fetchAccounts();
  }

  async function testAccount(id: string) {
    setTestingId(id); setTestStatus((prev) => ({ ...prev, [id]: null }));
    try {
      const r = (await apiFetch(`/accounts/${id}/test`, { method: "POST" })) as { ok: boolean; name?: string; error?: string };
      setTestStatus((prev) => ({ ...prev, [id]: { ok: r.ok, msg: r.ok ? `✓ ${r.name ?? "Conectado"}` : r.error ?? "Erro" } }));
    } catch (e) {
      setTestStatus((prev) => ({ ...prev, [id]: { ok: false, msg: (e as Error).message } }));
    } finally { setTestingId(null); }
  }

  async function toggleAccountActive(account: SocialAccount) {
    await apiFetch(`/accounts/${account.id}`, { method: "PUT", body: JSON.stringify({ isActive: !account.isActive }) });
    await fetchAccounts();
  }

  // ── Template ops ──────────────────────────────────────────────────────────

  function newTemplate(type: "feed" | "story") {
    setCurrentTemplate({
      id: "", name: `Novo ${type === "feed" ? "Feed" : "Story"}`,
      type, width: 1080, height: type === "feed" ? 1350 : 1920,
      backgroundColor: "#1a1a1a", elements: [],
    });
    setSelectedElId(null);
  }

  async function loadTemplate(id: string) {
    const t = (await apiFetch(`/templates/${id}`)) as SocialTemplate;
    setCurrentTemplate({ ...t, elements: (t.elements ?? []) as TemplateElement[] });
    setSelectedElId(null);
  }

  async function saveTemplate() {
    if (!currentTemplate) return;
    setTemplateSaving(true);
    try {
      let saved: SocialTemplate;
      if (currentTemplate.id) {
        saved = (await apiFetch(`/templates/${currentTemplate.id}`, { method: "PUT", body: JSON.stringify(currentTemplate) })) as SocialTemplate;
      } else {
        saved = (await apiFetch("/templates", { method: "POST", body: JSON.stringify(currentTemplate) })) as SocialTemplate;
      }
      setCurrentTemplate((prev) => prev ? { ...prev, id: saved.id } : prev);
      setTemplateSaved(true); setTimeout(() => setTemplateSaved(false), 2000);
      await fetchTemplates();
    } finally { setTemplateSaving(false); }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Remover este template?")) return;
    await apiFetch(`/templates/${id}`, { method: "DELETE" });
    if (currentTemplate?.id === id) setCurrentTemplate(null);
    await fetchTemplates();
  }

  function addElement(type: TemplateElement["type"]) {
    const el = makeElement(type);
    setCurrentTemplate((prev) => prev ? { ...prev, elements: [...prev.elements, el] } : prev);
    setSelectedElId(el.id);
  }

  function updateElement(id: string, patch: Partial<TemplateElement>) {
    setCurrentTemplate((prev) => prev ? {
      ...prev, elements: prev.elements.map((el) => el.id === id ? { ...el, ...patch } : el),
    } : prev);
  }

  function removeElement(id: string) {
    setCurrentTemplate((prev) => prev ? { ...prev, elements: prev.elements.filter((el) => el.id !== id) } : prev);
    if (selectedElId === id) setSelectedElId(null);
  }

  function moveElementZ(id: string, dir: "up" | "down") {
    setCurrentTemplate((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (dir === "up" && idx < sorted.length - 1) {
        const a = sorted[idx]!, b = sorted[idx + 1]!;
        sorted[idx] = { ...b, zIndex: a.zIndex }; sorted[idx + 1] = { ...a, zIndex: b.zIndex };
      } else if (dir === "down" && idx > 0) {
        const a = sorted[idx]!, b = sorted[idx - 1]!;
        sorted[idx] = { ...b, zIndex: a.zIndex }; sorted[idx - 1] = { ...a, zIndex: b.zIndex };
      }
      return { ...prev, elements: sorted };
    });
  }

  // ── Queue ops ─────────────────────────────────────────────────────────────

  async function openQueueModal() {
    try {
      const data = (await fetch("/api/articles?limit=200&status=published").then((r) => r.json())) as { articles?: ArticleOption[] } | ArticleOption[];
      const list = Array.isArray(data) ? data : (data.articles ?? []);
      setArticles(list as ArticleOption[]);
    } catch { setArticles([]); }
    setQueueForm({ articleId: "", accountIds: [], templateFeedId: templates[0]?.id ?? "", templateStoryId: "", caption: "", types: ["feed"], scheduledAt: "" });
    setArticleSearch("");
    setShowQueueModal(true);
  }

  async function submitQueueForm() {
    if (!queueForm.articleId || !queueForm.accountIds.length) return;
    await apiFetch("/queue", { method: "POST", body: JSON.stringify(queueForm) });
    setShowQueueModal(false); await fetchQueue();
  }

  async function removeFromQueue(id: string) {
    await apiFetch(`/queue/${id}`, { method: "DELETE" });
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  async function retryQueueItem(id: string) {
    await apiFetch(`/queue/${id}/retry`, { method: "POST" });
    await fetchQueue();
  }

  async function processQueue() {
    setProcessing(true);
    try { await apiFetch("/process", { method: "POST" }); await fetchQueue(); }
    finally { setProcessing(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedEl = currentTemplate?.elements.find((e) => e.id === selectedElId) ?? null;
  const previewH   = currentTemplate ? Math.round(currentTemplate.height * SCALE) : 450;

  const tabBtn = (t: typeof tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
        tab === t ? "bg-white text-[#0B2A66]" : "text-white/70 hover:text-white"
      }`}
      style={tab === t ? { boxShadow: CARD_SHADOW } : {}}
    >
      {icon} {label}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Redes Sociais">

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-6 bg-[#0B2A66] rounded-2xl p-1.5 w-fit">
        {tabBtn("accounts",  "Contas",    <Facebook size={15} />)}
        {tabBtn("templates", "Templates", <Layers size={15} />)}
        {tabBtn("queue",     "Fila",      <Clock size={15} />)}
      </div>

      {/* ══════════ CONTAS ══════════════════════════════════════════════════ */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Contas Meta conectadas</h2>
              <p className="text-sm text-slate-500 mt-0.5">Páginas do Facebook e perfis Instagram Business</p>
            </div>
            <button
              onClick={() => { setEditingAccount({ name: "", isActive: true }); setShowAccountModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: PRIMARY }}
            >
              <Plus size={15} /> Adicionar Conta
            </button>
          </div>

          {accountsLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
          ) : accounts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 size={24} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Nenhuma conta conectada</p>
              <p className="text-xs text-slate-400 mt-1">Adicione uma conta Meta (Facebook/Instagram) para começar</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-white rounded-2xl p-5 flex items-center gap-4" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: acc.instagramId ? "#E1306C" : "#1877F2" }}>
                    {acc.instagramId ? <Instagram size={20} className="text-white" /> : <Facebook size={20} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{acc.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
                      {acc.pageId      && <span>Page: {acc.pageId}</span>}
                      {acc.instagramId && <span>IG: {acc.instagramId}</span>}
                    </div>
                    {testStatus[acc.id] && (
                      <p className={`text-xs mt-1 font-medium ${testStatus[acc.id]?.ok ? "text-green-600" : "text-red-500"}`}>
                        {testStatus[acc.id]?.msg}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${acc.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                      {acc.isActive ? "Ativo" : "Pausado"}
                    </span>
                    <button onClick={() => { void testAccount(acc.id); }} disabled={testingId === acc.id} title="Testar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50">
                      {testingId === acc.id ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
                    </button>
                    <button onClick={() => { void toggleAccountActive(acc); }} title="Ativar/Pausar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                      {acc.isActive ? <ToggleRight size={15} className="text-green-500" /> : <ToggleLeft size={15} />}
                    </button>
                    <button onClick={() => { setEditingAccount({ ...acc, accessToken: "" }); setShowAccountModal(true); }} title="Editar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-[#EEF2FF] transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { void deleteAccount(acc.id); }} title="Remover"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ TEMPLATES ═══════════════════════════════════════════════ */}
      {tab === "templates" && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl p-3" style={{ boxShadow: CARD_SHADOW }}>
            <select
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-slate-50"
              value={currentTemplate?.id ?? ""}
              onChange={(e) => { if (e.target.value) void loadTemplate(e.target.value); }}
            >
              <option value="">— Selecionar template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.type === "feed" ? "Feed" : "Story"})</option>)}
            </select>
            <button onClick={() => newTemplate("feed")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: PRIMARY }}>
              <Plus size={13} /> Feed
            </button>
            <button onClick={() => newTemplate("story")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: "#9333EA" }}>
              <Plus size={13} /> Story
            </button>
            {currentTemplate && (
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <input value={currentTemplate.name}
                  onChange={(e) => setCurrentTemplate((p) => p ? { ...p, name: e.target.value } : p)}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] min-w-[160px]"
                  placeholder="Nome do template" />
                <select value={currentTemplate.type}
                  onChange={(e) => {
                    const t = e.target.value as "feed" | "story";
                    setCurrentTemplate((p) => p ? { ...p, type: t, height: t === "feed" ? 1350 : 1920 } : p);
                  }}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-slate-50">
                  <option value="feed">Feed (1080×1350)</option>
                  <option value="story">Story (1080×1920)</option>
                </select>
                {currentTemplate.id && (
                  <button onClick={() => { void deleteTemplate(currentTemplate.id); }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
                <button onClick={() => { void saveTemplate(); }} disabled={templateSaving}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-60 ${templateSaved ? "!bg-green-500" : ""}`}
                  style={!templateSaved ? { background: ACCENT } : {}}>
                  {templateSaving ? <Loader2 size={13} className="animate-spin" /> : templateSaved ? <CheckCircle size={13} /> : <Save size={13} />}
                  {templateSaving ? "Salvando…" : templateSaved ? "Salvo!" : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {!currentTemplate ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <Layers size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Selecione um template ou crie um novo para começar</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_300px] gap-4">

              {/* LEFT — Layers */}
              <div className="bg-white rounded-2xl p-4 space-y-3" style={{ boxShadow: CARD_SHADOW }}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Camadas</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["image","title","category","logo","cta","text"] as const).map((type) => (
                    <button key={type} onClick={() => addElement(type)}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-[#0B2A66] hover:text-[#0B2A66] transition-colors">
                      <Plus size={11} /> {ELEMENT_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-slate-500 w-12 shrink-0">Fundo</label>
                  <input type="color" value={currentTemplate.backgroundColor}
                    onChange={(e) => setCurrentTemplate((p) => p ? { ...p, backgroundColor: e.target.value } : p)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-200" />
                  <input type="text" value={currentTemplate.backgroundColor}
                    onChange={(e) => setCurrentTemplate((p) => p ? { ...p, backgroundColor: e.target.value } : p)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                </div>
                <div className="border-t border-slate-100 pt-2 space-y-1">
                  {[...currentTemplate.elements].sort((a, b) => b.zIndex - a.zIndex).map((el) => (
                    <div key={el.id} onClick={() => setSelectedElId(el.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                        selectedElId === el.id ? "bg-[#EEF2FF] border border-[#C7D2FE]" : "hover:bg-slate-50 border border-transparent"
                      }`}>
                      <span className="text-xs font-medium text-slate-700 flex-1 truncate">
                        {ELEMENT_TYPE_LABELS[el.type] ?? el.type}
                        {el.content ? ` — ${el.content.slice(0, 14)}` : ""}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, "up"); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700">
                          <ChevronUp size={11} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, "down"); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700">
                          <ChevronDown size={11} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {currentTemplate.elements.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Adicione elementos acima</p>
                  )}
                </div>
              </div>

              {/* CENTER — Canvas preview */}
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center" style={{ boxShadow: CARD_SHADOW }}>
                <p className="text-xs text-slate-400 mb-3 self-start">
                  Preview {currentTemplate.width}×{currentTemplate.height}px · escala 1:{Math.round(1/SCALE)}
                </p>
                <div
                  className="relative shrink-0 overflow-hidden select-none"
                  style={{
                    width: PREVIEW_W, height: previewH,
                    background: currentTemplate.backgroundColor,
                    cursor: dragging ? "grabbing" : "default",
                  }}
                  onClick={() => setSelectedElId(null)}
                >
                  {[...currentTemplate.elements].sort((a, b) => a.zIndex - b.zIndex).map((el) => {
                    const isImg = el.type === "image" || el.type === "logo";
                    return (
                      <div key={el.id}
                        onMouseDown={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          setSelectedElId(el.id);
                          setDragging({ id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
                        }}
                        style={{
                          position: "absolute",
                          left: Math.round(el.x * SCALE), top: Math.round(el.y * SCALE),
                          width: Math.round(el.width * SCALE), height: Math.round(el.height * SCALE),
                          backgroundColor: el.backgroundColor || (isImg ? "#444" : "transparent"),
                          borderRadius: el.borderRadius * SCALE,
                          opacity: el.opacity, cursor: "grab",
                          outline: selectedElId === el.id ? "2px solid #2563EB" : "none",
                          outlineOffset: 1, overflow: "hidden", boxSizing: "border-box",
                        }}
                      >
                        {isImg ? (
                          <div className="w-full h-full flex items-center justify-center text-white/50 text-[10px] gap-1">
                            <ImageIcon size={12} />
                            {el.type === "image" ? "Imagem do artigo" : "Logo"}
                          </div>
                        ) : (
                          <div style={{
                            padding: el.padding * SCALE,
                            fontSize: Math.max(8, el.fontSize * SCALE),
                            fontFamily: el.fontFamily, fontWeight: el.fontWeight,
                            color: el.color || "#fff", textAlign: el.textAlign,
                            lineHeight: 1.3, wordBreak: "break-word", overflow: "hidden",
                          }}>
                            {el.content || <span style={{ opacity: 0.4 }}>{ELEMENT_TYPE_LABELS[el.type]}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT — Properties */}
              <div className="bg-white rounded-2xl p-4 space-y-3 overflow-y-auto max-h-[700px]" style={{ boxShadow: CARD_SHADOW }}>
                {!selectedEl ? (
                  <div className="flex items-center justify-center h-40 text-slate-300 text-sm text-center">
                    Clique num elemento no canvas para editar suas propriedades
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{ELEMENT_TYPE_LABELS[selectedEl.type]}</p>

                    {/* Position & Size */}
                    <div className="grid grid-cols-2 gap-2">
                      {(["x","y","width","height"] as const).map((prop) => (
                        <div key={prop}>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            {prop === "x" ? "X" : prop === "y" ? "Y" : prop === "width" ? "Largura" : "Altura"}
                          </label>
                          <input type="number" value={selectedEl[prop]}
                            onChange={(e) => updateElement(selectedEl.id, { [prop]: Number(e.target.value) })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                        </div>
                      ))}
                    </div>

                    {/* Content */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                        {selectedEl.type === "image" || selectedEl.type === "logo" ? "URL da imagem" : "Conteúdo"}
                      </label>
                      <textarea rows={2} value={selectedEl.content}
                        onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] resize-none"
                        placeholder={
                          selectedEl.type === "title"    ? "{{title}}" :
                          selectedEl.type === "category" ? "{{category}}" :
                          selectedEl.type === "image"    ? "URL de fallback" :
                          selectedEl.type === "logo"     ? "https://…/logo.png" : "Texto…"
                        } />
                      {(selectedEl.type === "title" || selectedEl.type === "category") && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Use {"{{title}}"} e {"{{category}}"} para dados do artigo</p>
                      )}
                    </div>

                    {/* Text props */}
                    {selectedEl.type !== "image" && selectedEl.type !== "logo" && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Fonte</label>
                            <select value={selectedEl.fontFamily}
                              onChange={(e) => updateElement(selectedEl.id, { fontFamily: e.target.value })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Tamanho</label>
                            <input type="number" value={selectedEl.fontSize}
                              onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Peso</label>
                            <select value={selectedEl.fontWeight}
                              onChange={(e) => updateElement(selectedEl.id, { fontWeight: e.target.value })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                              {["normal","bold","light"].map((w) => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Alinhamento</label>
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                              {(["left","center","right"] as const).map((a) => (
                                <button key={a} onClick={() => updateElement(selectedEl.id, { textAlign: a })}
                                  className={`flex-1 py-1.5 flex items-center justify-center transition-colors ${
                                    selectedEl.textAlign === a ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"
                                  }`}>
                                  {a === "left" ? <AlignLeft size={11} /> : a === "center" ? <AlignCenter size={11} /> : <AlignRight size={11} />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor do texto</label>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={selectedEl.color}
                                onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                              <input type="text" value={selectedEl.color}
                                onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor de fundo</label>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={selectedEl.backgroundColor || "#000000"}
                                onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                              <input type="text" value={selectedEl.backgroundColor}
                                onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* objectFit */}
                    {(selectedEl.type === "image" || selectedEl.type === "logo") && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Ajuste de imagem</label>
                        <select value={selectedEl.objectFit ?? "cover"}
                          onChange={(e) => updateElement(selectedEl.id, { objectFit: e.target.value as "cover" | "contain" | "fill" })}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                          {["cover","contain","fill"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Numeric props */}
                    <div className="grid grid-cols-2 gap-2">
                      {(["padding","borderRadius","opacity","zIndex"] as const).map((prop) => (
                        <div key={prop}>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            {prop === "padding" ? "Padding" : prop === "borderRadius" ? "Raio borda" : prop === "opacity" ? "Opacidade" : "Z-Index"}
                          </label>
                          <input type="number"
                            step={prop === "opacity" ? 0.1 : 1} min={0} max={prop === "opacity" ? 1 : undefined}
                            value={selectedEl[prop]}
                            onChange={(e) => updateElement(selectedEl.id, { [prop]: Number(e.target.value) })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ FILA ════════════════════════════════════════════════════ */}
      {tab === "queue" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-800 flex-1">Fila de publicação</h2>
            <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-white">
              <option value="all">Todos</option>
              <option value="pending">Aguardando</option>
              <option value="processing">Processando</option>
              <option value="published">Publicado</option>
              <option value="failed">Falhou</option>
            </select>
            <button onClick={() => { void processQueue(); }} disabled={processing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "#16A34A" }}>
              {processing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {processing ? "Processando…" : "Processar agora"}
            </button>
            <button onClick={() => { void fetchQueue(); }} title="Atualizar"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { void openQueueModal(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: PRIMARY }}>
              <Plus size={15} /> Adicionar à fila
            </button>
          </div>

          {queueLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
          ) : queue.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <Clock size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nenhum item na fila</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden overflow-x-auto" style={{ boxShadow: CARD_SHADOW }}>
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Artigo","Conta","Tipo","Status","Agendado","Ações"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {queue.map((item) => {
                    const sc: Record<string, string> = { pending:"bg-amber-50 text-amber-600", processing:"bg-blue-50 text-blue-600", published:"bg-green-50 text-green-700", failed:"bg-red-50 text-red-600" };
                    const sl: Record<string, string> = { pending:"Aguardando", processing:"Processando", published:"Publicado", failed:"Falhou" };
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 group transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-800 font-medium truncate max-w-[200px]" title={item.articleTitle ?? ""}>
                            {item.articleTitle ?? item.articleId.slice(0, 8) + "…"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{item.accountName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === "story" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                            {item.type === "story" ? "Story" : "Feed"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc[item.status] ?? "bg-slate-100 text-slate-500"}`}>
                            {sl[item.status] ?? item.status}
                          </span>
                          {item.errorMessage && (
                            <p className="text-[11px] text-red-500 mt-0.5 truncate max-w-[140px]" title={item.errorMessage}>{item.errorMessage}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                          {item.status === "published" ? fmtDate(item.publishedAt) : fmtDate(item.scheduledAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.status === "failed" && (
                              <button onClick={() => { void retryQueueItem(item.id); }} title="Tentar novamente"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <RefreshCw size={12} />
                              </button>
                            )}
                            {item.metaPostId && (
                              <a href={`https://www.instagram.com/p/${item.metaPostId}`} target="_blank" rel="noreferrer"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <Link2 size={12} />
                              </a>
                            )}
                            <button onClick={() => { void removeFromQueue(item.id); }} title="Remover"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ MODAL — Conta ══════════════════════════════════════════ */}
      {showAccountModal && editingAccount && (
        <AccountModal
          editingAccount={editingAccount}
          setEditingAccount={setEditingAccount}
          accountSaving={accountSaving}
          onSave={() => { void saveAccount(); }}
          onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
        />
      )}

      {/* ══════════ MODAL — Adicionar à fila ═══════════════════════════════ */}
      {showQueueModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Adicionar à fila de publicação</h3>
              <button onClick={() => setShowQueueModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Artigo *</label>
                <input
                  type="text"
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                  placeholder="Buscar por título ou editoria…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] bg-slate-50 mb-2"
                />
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto bg-slate-50">
                  {articles.length === 0 && (
                    <p className="text-sm text-slate-400 p-3 text-center">Nenhum artigo publicado encontrado.</p>
                  )}
                  {articles
                    .filter((a) => {
                      const q = articleSearch.toLowerCase();
                      return !q || a.title.toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q);
                    })
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setQueueForm((f) => ({ ...f, articleId: a.id }))}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2 border-b border-slate-100 last:border-0 hover:bg-white transition-colors ${queueForm.articleId === a.id ? "bg-blue-50 border-l-2 border-l-[#0B2A66]" : ""}`}
                      >
                        {a.imageUrl && (
                          <img src={a.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate leading-tight">{a.title}</p>
                          {a.category && <p className="text-[11px] text-slate-400 mt-0.5">{a.category}</p>}
                        </div>
                        {queueForm.articleId === a.id && (
                          <CheckCircle size={14} className="text-[#0B2A66] shrink-0 mt-1" />
                        )}
                      </button>
                    ))
                  }
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Contas *</label>
                <div className="space-y-2">
                  {accounts.filter((a) => a.isActive).map((acc) => (
                    <label key={acc.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox"
                        checked={queueForm.accountIds.includes(acc.id)}
                        onChange={(e) => setQueueForm((f) => ({
                          ...f,
                          accountIds: e.target.checked ? [...f.accountIds, acc.id] : f.accountIds.filter((id) => id !== acc.id),
                        }))} />
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: acc.instagramId ? "#E1306C" : "#1877F2" }}>
                        {acc.instagramId ? <Instagram size={12} className="text-white" /> : <Facebook size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700">{acc.name}</span>
                    </label>
                  ))}
                  {accounts.filter((a) => a.isActive).length === 0 && (
                    <p className="text-sm text-slate-400">Nenhuma conta ativa. Adicione contas na aba "Contas".</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Tipo</label>
                <div className="flex gap-4">
                  {(["feed","story"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={queueForm.types.includes(t)}
                        onChange={(e) => setQueueForm((f) => ({
                          ...f, types: e.target.checked ? [...f.types, t] : f.types.filter((x) => x !== t),
                        }))} />
                      <span className="text-sm text-slate-700">{t === "feed" ? "Feed (1080×1350)" : "Story (1080×1920)"}</span>
                    </label>
                  ))}
                </div>
              </div>
              {queueForm.types.includes("feed") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Template Feed</label>
                  <select value={queueForm.templateFeedId}
                    onChange={(e) => setQueueForm((f) => ({ ...f, templateFeedId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50">
                    <option value="">Sem template (sem arte)</option>
                    {templates.filter((t) => t.type === "feed").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {queueForm.types.includes("story") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Template Story</label>
                  <select value={queueForm.templateStoryId}
                    onChange={(e) => setQueueForm((f) => ({ ...f, templateStoryId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50">
                    <option value="">Sem template (sem arte)</option>
                    {templates.filter((t) => t.type === "story").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Legenda</label>
                <textarea rows={3} value={queueForm.caption}
                  onChange={(e) => setQueueForm((f) => ({ ...f, caption: e.target.value }))}
                  placeholder="Escreva a legenda que acompanhará a publicação…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] resize-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Agendar para</label>
                <input type="datetime-local" value={queueForm.scheduledAt}
                  onChange={(e) => setQueueForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50" />
                <p className="text-[11px] text-slate-400 mt-1">Deixe em branco para publicar imediatamente (na próxima execução do cron)</p>
              </div>
            </div>
            <div className="flex gap-2 p-6 pt-0">
              <button
                onClick={() => { void submitQueueForm(); }}
                disabled={!queueForm.articleId || !queueForm.accountIds.length || !queueForm.types.length}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: PRIMARY }}>
                <Send size={14} /> Adicionar à fila
              </button>
              <button onClick={() => setShowQueueModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
