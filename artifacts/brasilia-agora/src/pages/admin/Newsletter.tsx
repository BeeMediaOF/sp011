import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, Users, Send, Settings as SettingsIcon, Save, TestTube2,
  Loader2, CheckCircle, AlertCircle, Plus, ArrowLeft, Clock, Calendar,
  Download, Search, ChevronLeft, ChevronRight, Ban, RefreshCw,
  Image as ImageIcon, Eye, LayoutTemplate, Code2, Trash2, Copy,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import RichTextEditor from "@/components/admin/RichTextEditor";
import {
  adminApi,
  type NewsletterSettings, type NewsletterCampaign, type NewsletterCampaignStatus,
  type NewsletterQueueStat, type NewsletterSubscribersPage,
  type NewsletterTemplate, type NewsletterTemplateRecord,
} from "../../lib/adminApi";

// ─── Subabas ────────────────────────────────────────────────────────────────
type Tab = "subscribers" | "campaigns" | "templates" | "config";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "subscribers", label: "Inscritos",      icon: Users },
  { id: "campaigns",   label: "Campanhas",      icon: Send },
  { id: "templates",   label: "Modelos",        icon: LayoutTemplate },
  { id: "config",      label: "Configurações",  icon: SettingsIcon },
];

const EMPTY: NewsletterSettings = {
  newsletterEnabled: false,
  newsletterFromName: "",
  newsletterFromEmail: "",
  newsletterSmtpHost: "smtp.gmail.com",
  newsletterSmtpPort: 587,
  newsletterSmtpUser: "",
  newsletterSmtpPass: "",
  hasNewsletterSmtpPass: false,
  newsletterReplyTo: "",
  newsletterDailyCap: 450,
  newsletterTemplate: {
    accentColor: "", logoMode: "wordmark", logoUrl: "", headerText: "", headerTextColor: "",
    pageBgColor: "", bodyTextColor: "", footerText: "", signature: "",
  },
};

// ─── Estilos compartilhados ──────────────────────────────────────────────────
const inputCls =
  "w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/30 " +
  "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 " +
  "placeholder:text-slate-400 dark:placeholder:text-slate-500";
const labelCls = "block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1";
const btnPrimary =
  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold hover:bg-[#0a2255] disabled:opacity-60 transition-colors";
const btnGhost =
  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

/** Campo de cor: seletor + hex textual. Vazio = herda o default do e-mail. */
function ColorField({ label, hint, value, fallback, onChange }: {
  label: string; hint?: string; value: string; fallback: string; onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent cursor-pointer shrink-0" />
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`${fallback} (vazio = padrão)`} />
      </div>
    </Field>
  );
}

function Banner({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
      msg.type === "ok"
        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
        : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300"}`}>
      {msg.type === "ok" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg.text}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ─── Moldura: campos + prévia (compartilhados por Configurações e Modelos) ────
const monoCls =
  "w-full px-3 py-2 border rounded-xl text-[12px] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/30 " +
  "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 " +
  "placeholder:text-slate-400 dark:placeholder:text-slate-500";

/** Campos estruturados da moldura (cabeçalho/rodapé/cores/logo) + modo "código"
 *  (HTML próprio de cabeçalho e rodapé). Controlado: `value` + `onChange`. */
function ShellFields({ value, title, onChange, onError }: {
  value: NewsletterTemplate; title?: string;
  onChange: (next: NewsletterTemplate) => void; onError?: (msg: string) => void;
}) {
  const [logoBusy, setLogoBusy] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [showCode, setShowCode] = useState(!!(value.headerHtml || value.footerHtml));
  const set = (k: keyof NewsletterTemplate, v: string) => onChange({ ...value, [k]: v });

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const r = await adminApi.uploadImage(file, "logo-newsletter");
      onChange({ ...value, logoUrl: r.url, logoMode: "image" });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Falha no upload da logo.");
    } finally { setLogoBusy(false); }
  }

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300">{title ?? "Cabeçalho e rodapé"}</h3>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-2">
        A moldura que envolve o corpo de cada campanha. O descadastro obrigatório é adicionado automaticamente no rodapé. Cores vazias usam o padrão.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Cabeçalho">
          <select className={inputCls} value={value.logoMode ?? "wordmark"} onChange={(e) => set("logoMode", e.target.value)}>
            <option value="wordmark">Nome do site no topo</option>
            <option value="image">Logo (imagem)</option>
            <option value="none">Sem cabeçalho de marca</option>
          </select>
        </Field>
        <ColorField label="Cor de destaque" hint="Barra do topo, botões e link de descadastro." value={value.accentColor ?? ""} fallback="#0B2A66" onChange={(v) => set("accentColor", v)} />

        {value.logoMode === "image" && (
          <div className="sm:col-span-2 space-y-2">
            <label className={labelCls}>Logo (imagem)</label>
            <div className="flex items-center gap-3 flex-wrap">
              {value.logoUrl
                ? <img src={value.logoUrl} alt="logo" className="h-11 w-auto max-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white object-contain px-2" />
                : <div className="h-11 px-4 flex items-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-[12px] text-slate-400">Sem logo</div>}
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />
              <button type="button" onClick={() => logoFileRef.current?.click()} disabled={logoBusy} className={btnGhost}>
                {logoBusy ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />} {value.logoUrl ? "Trocar logo" : "Enviar logo"}
              </button>
              {value.logoUrl && <button type="button" onClick={() => set("logoUrl", "")} className="text-[12px] text-red-500 hover:underline">Remover</button>}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">PNG com fundo transparente fica melhor sobre a cor de destaque.</p>
          </div>
        )}

        <ColorField label="Cor do texto do cabeçalho" hint="Nome do site sobre a barra de destaque." value={value.headerTextColor ?? ""} fallback="#ffffff" onChange={(v) => set("headerTextColor", v)} />
        <ColorField label="Fundo da página" value={value.pageBgColor ?? ""} fallback="#F0F4F8" onChange={(v) => set("pageBgColor", v)} />
        <ColorField label="Cor do texto do corpo" value={value.bodyTextColor ?? ""} fallback="#1A202C" onChange={(v) => set("bodyTextColor", v)} />
        <Field label="Texto do cabeçalho (opcional)" hint="Vazio = nome do remetente."><input className={inputCls} value={value.headerText ?? ""} onChange={(e) => set("headerText", e.target.value)} /></Field>
        <Field label="Assinatura (opcional)"><input className={inputCls} value={value.signature ?? ""} onChange={(e) => set("signature", e.target.value)} placeholder="Equipe SP011" /></Field>
        <div className="sm:col-span-2">
          <Field label="Texto do rodapé (opcional)"><textarea className={`${inputCls} min-h-[70px] resize-y`} value={value.footerText ?? ""} onChange={(e) => set("footerText", e.target.value)} placeholder="Endereço, CNPJ ou aviso legal…" /></Field>
        </div>
      </div>

      {/* Modo "código": HTML próprio de cabeçalho/rodapé (colar ou eu montar). */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
        <button type="button" onClick={() => setShowCode((v) => !v)}
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2A66] dark:text-blue-300">
          <Code2 size={15} /> HTML avançado (cabeçalho/rodapé) {showCode ? "▲" : "▼"}
        </button>
        {showCode && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cole HTML de e-mail (tabelas + <code>style</code> inline). Estilos inline seguros são preservados; scripts e <code>on…</code> são removidos. Deixe vazio para usar os campos acima.
            </p>
            <Field label="HTML do cabeçalho" hint="Substitui a logo/wordmark quando preenchido.">
              <textarea className={`${monoCls} min-h-[120px] resize-y`} value={value.headerHtml ?? ""} onChange={(e) => set("headerHtml", e.target.value)}
                placeholder={'<table width="100%"><tr><td style="padding:24px;text-align:center;background:#0B2A66;color:#fff;">…</td></tr></table>'} />
            </Field>
            <Field label="HTML do rodapé" hint="Entra acima das linhas automáticas de remetente e descadastro (que nunca somem).">
              <textarea className={`${monoCls} min-h-[120px] resize-y`} value={value.footerHtml ?? ""} onChange={(e) => set("footerHtml", e.target.value)}
                placeholder={'<table width="100%"><tr><td style="text-align:center;">…</td></tr></table>'} />
            </Field>
          </div>
        )}
      </div>
    </section>
  );
}

/** Prévia ao vivo da moldura (renderizada no servidor, com debounce). */
function ShellPreview({ template, fromName, height = 620 }: { template: NewsletterTemplate; fromName?: string; height?: number }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      adminApi.previewNewsletter({ newsletterTemplate: template, fromName })
        .then((r) => { if (alive) setHtml(r.html); })
        .catch(() => { /* prévia é best-effort */ });
    }, 350);
    return () => { alive = false; clearTimeout(h); };
  }, [template, fromName]);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Eye size={16} className="text-[#0B2A66] dark:text-blue-300" />
        <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300">Pré-visualização</h3>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">atualiza conforme você edita</span>
      </div>
      {html ? (
        <iframe title="Prévia do e-mail" srcDoc={html} sandbox=""
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white" style={{ height }} />
      ) : (
        <div className="h-[240px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Gerando prévia…
        </div>
      )}
    </section>
  );
}

// ─── Aba Configurações ────────────────────────────────────────────────────────
function ConfigTab() {
  const [form, setForm] = useState<NewsletterSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.getNewsletterSettings()
      .then((r) => { if (alive) setForm({ ...EMPTY, ...r.settings, newsletterTemplate: { ...EMPTY.newsletterTemplate, ...r.settings.newsletterTemplate } }); })
      .catch((e) => { if (alive) setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao carregar." }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const set = useCallback(<K extends keyof NewsletterSettings>(k: K, v: NewsletterSettings[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await adminApi.updateNewsletterSettings(form);
      setForm({ ...EMPTY, ...r.settings, newsletterTemplate: { ...EMPTY.newsletterTemplate, ...r.settings.newsletterTemplate } });
      setMsg({ type: "ok", text: "Configurações salvas." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setMsg(null);
    try {
      // Salva antes de testar para o servidor usar a config atual da tela.
      await adminApi.updateNewsletterSettings(form);
      const r = await adminApi.sendNewsletterTest();
      if (r.ok) setMsg({ type: "ok", text: `E-mail de teste enviado para ${r.to}.` });
      else setMsg({ type: "err", text: r.error ?? "Falha ao enviar o teste." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao enviar o teste." });
    } finally { setTesting(false); }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-400 text-sm py-10"><Loader2 size={16} className="animate-spin" /> Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <Banner msg={msg} />

      {/* Duas colunas: configuração à esquerda, prévia ao vivo à direita — usa a
          largura toda da tela e evita rolar para ver o resultado. Empilha < xl. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      {/* Coluna esquerda — configuração */}
      <div className="space-y-6 min-w-0">

      {/* Liga/desliga */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Newsletter {form.newsletterEnabled ? "ativa" : "desligada"}
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            {form.newsletterEnabled
              ? "Ligada — confirmações e campanhas são enviadas pelo remetente configurado. Lembre de Salvar."
              : "Desligada — a captura no site segue funcionando, mas nenhum e-mail é enviado."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => set("newsletterEnabled", !form.newsletterEnabled)}
          aria-pressed={form.newsletterEnabled}
          className={`relative shrink-0 inline-flex items-center w-12 h-6 rounded-full transition-colors ${form.newsletterEnabled ? "bg-[#0B2A66]" : "bg-slate-300 dark:bg-slate-600"}`}
        >
          <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-md ring-1 ring-black/10 transform transition-transform ${form.newsletterEnabled ? "translate-x-[26px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Remetente Gmail */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300 flex items-center gap-2"><Mail size={16} /> Remetente (Gmail)</h3>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-2">
          Use uma <strong>senha de app</strong> do Gmail (não a senha da conta). A senha fica criptografada no banco e nunca é exibida.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome do remetente"><input className={inputCls} value={form.newsletterFromName} onChange={(e) => set("newsletterFromName", e.target.value)} placeholder="Ex.: SP011 Notícias" /></Field>
          <Field label="E-mail do remetente"><input className={inputCls} type="email" value={form.newsletterFromEmail} onChange={(e) => set("newsletterFromEmail", e.target.value)} placeholder="voce@gmail.com" /></Field>
          <Field label="Usuário SMTP" hint="Normalmente o próprio e-mail do Gmail."><input className={inputCls} value={form.newsletterSmtpUser} onChange={(e) => set("newsletterSmtpUser", e.target.value)} placeholder="voce@gmail.com" /></Field>
          <Field label="Senha de app" hint={form.hasNewsletterSmtpPass ? "Já configurada. Deixe como está para manter." : "16 caracteres gerados no Gmail."}>
            <input className={inputCls} type="password" value={form.newsletterSmtpPass} onChange={(e) => set("newsletterSmtpPass", e.target.value)} placeholder="senha de app" autoComplete="new-password" />
          </Field>
          <Field label="Servidor SMTP"><input className={inputCls} value={form.newsletterSmtpHost} onChange={(e) => set("newsletterSmtpHost", e.target.value)} placeholder="smtp.gmail.com" /></Field>
          <Field label="Porta" hint="587 = STARTTLS · 465 = SSL"><input className={inputCls} type="number" value={form.newsletterSmtpPort} onChange={(e) => set("newsletterSmtpPort", Number(e.target.value))} /></Field>
          <Field label="Responder para (opcional)"><input className={inputCls} type="email" value={form.newsletterReplyTo} onChange={(e) => set("newsletterReplyTo", e.target.value)} placeholder="contato@seudominio.com" /></Field>
          <Field label="Teto diário de envios" hint="Margem sobre o limite de ~500/dia do Gmail comum."><input className={inputCls} type="number" value={form.newsletterDailyCap} onChange={(e) => set("newsletterDailyCap", Number(e.target.value))} /></Field>
        </div>
      </section>

      {/* Moldura "Padrão" (usada por confirmações e por campanhas sem moldura escolhida) */}
      <ShellFields
        title="Moldura padrão do e-mail"
        value={form.newsletterTemplate}
        onChange={(next) => set("newsletterTemplate", next)}
        onError={(text) => setMsg({ type: "err", text })}
      />
      <p className="text-[12px] text-slate-500 dark:text-slate-400 px-1 -mt-2 flex items-center gap-1.5">
        <LayoutTemplate size={13} /> Esta é a moldura padrão. Crie outras (e escolha por campanha) na aba <strong>Modelos</strong>.
      </p>

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving || testing} className={btnPrimary}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
        </button>
        <button onClick={test} disabled={saving || testing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#0B2A66] text-[#0B2A66] dark:text-blue-300 dark:border-blue-400 text-sm font-semibold hover:bg-[#0B2A66]/5 disabled:opacity-60 transition-colors">
          {testing ? <Loader2 size={15} className="animate-spin" /> : <TestTube2 size={15} />} Enviar e-mail de teste
        </button>
      </div>

      </div>{/* fim da coluna esquerda */}

      {/* Coluna direita — prévia ao lado (sticky): preenche a tela e evita rolar */}
      <div className="min-w-0 xl:sticky xl:top-4">
        <ShellPreview template={form.newsletterTemplate} fromName={form.newsletterFromName} />
      </div>

      </div>{/* fim do grid de 2 colunas */}
    </div>
  );
}

// ─── Aba Campanhas ────────────────────────────────────────────────────────────
const CAMPAIGN_STATUS: Record<NewsletterCampaignStatus, { label: string; cls: string }> = {
  draft:     { label: "Rascunho",  cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  scheduled: { label: "Agendada",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  sending:   { label: "Enviando",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  sent:      { label: "Enviada",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  failed:    { label: "Falhou",    cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  canceled:  { label: "Cancelada", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

function StatusPill({ status }: { status: NewsletterCampaignStatus }) {
  const s = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.draft;
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

const QUEUE_LABEL: Record<string, string> = {
  pending: "Na fila", sending: "Enviando", sent: "Enviados", failed: "Falharam", dead: "Descartados",
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Editor/visualização de uma campanha. `campaign` null = nova. */
function CampaignEditor({ campaign, onClose }: { campaign: NewsletterCampaign | null; onClose: (changed: boolean) => void }) {
  const editable = !campaign || campaign.status === "draft" || campaign.status === "scheduled";
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.bodyHtml ?? "");
  const [templateId, setTemplateId] = useState<number | null>(campaign?.templateId ?? null);
  const [templates, setTemplates] = useState<NewsletterTemplateRecord[]>([]);
  const [busy, setBusy] = useState<null | "save" | "send" | "schedule" | "cancel">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [queue, setQueue] = useState<NewsletterQueueStat[] | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const changedRef = useRef(false);

  // Molduras da biblioteca para o seletor (Padrão + as salvas).
  useEffect(() => {
    let alive = true;
    adminApi.listNewsletterTemplates()
      .then((r) => { if (alive) setTemplates(r.templates); })
      .catch(() => { /* seletor cai só para "Padrão" */ });
    return () => { alive = false; };
  }, []);

  // Detalhe (fila) só faz sentido depois de disparada.
  useEffect(() => {
    if (!campaign || editable) return;
    let alive = true;
    adminApi.getNewsletterCampaign(campaign.id)
      .then((r) => { if (alive) setQueue(r.queue); })
      .catch(() => { /* silencioso */ });
    return () => { alive = false; };
  }, [campaign, editable]);

  function validate(): boolean {
    if (!subject.trim()) { setMsg({ type: "err", text: "Informe o assunto da campanha." }); return false; }
    if (!body.replace(/<[^>]+>/g, "").trim()) { setMsg({ type: "err", text: "O corpo da campanha está vazio." }); return false; }
    return true;
  }

  /** Cria (se nova) ou atualiza (se rascunho/agendada) e devolve o id. */
  async function persist(): Promise<number> {
    if (campaign?.id) {
      await adminApi.updateNewsletterCampaign(campaign.id, { subject: subject.trim(), bodyHtml: body, templateId });
      changedRef.current = true;
      return campaign.id;
    }
    const r = await adminApi.createNewsletterCampaign({ subject: subject.trim(), bodyHtml: body, templateId });
    changedRef.current = true;
    return r.campaign.id;
  }

  async function saveDraft() {
    if (!validate()) return;
    setBusy("save"); setMsg(null);
    try { await persist(); setMsg({ type: "ok", text: "Rascunho salvo." }); }
    catch (e) { setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao salvar." }); }
    finally { setBusy(null); }
  }

  async function sendNow() {
    if (!validate()) return;
    if (!window.confirm("Enviar esta campanha agora para todos os inscritos confirmados?")) return;
    setBusy("send"); setMsg(null);
    try {
      const id = await persist();
      const r = await adminApi.sendNewsletterCampaign(id);
      if (r.ok) { onClose(true); return; }
      setMsg({ type: "err", text: "Não foi possível enviar." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally { setBusy(null); }
  }

  async function schedule() {
    if (!validate()) return;
    const dt = new Date(when);
    if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
      setMsg({ type: "err", text: "Escolha uma data/hora no futuro." }); return;
    }
    setBusy("schedule"); setMsg(null);
    try {
      const id = await persist();
      const r = await adminApi.sendNewsletterCampaign(id, dt.toISOString());
      if (r.ok) { onClose(true); return; }
      setMsg({ type: "err", text: "Não foi possível agendar." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao agendar." });
    } finally { setBusy(null); }
  }

  async function cancel() {
    if (!campaign) return;
    if (!window.confirm("Cancelar esta campanha? Os envios ainda na fila serão interrompidos.")) return;
    setBusy("cancel"); setMsg(null);
    try {
      const r = await adminApi.cancelNewsletterCampaign(campaign.id);
      if (r.ok) { onClose(true); return; }
      setMsg({ type: "err", text: r.error ?? "Não foi possível cancelar." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao cancelar." });
    } finally { setBusy(null); }
  }

  const canCancel = campaign && campaign.status !== "sent" && campaign.status !== "canceled";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onClose(changedRef.current)} className={btnGhost}>
          <ArrowLeft size={15} /> Voltar
        </button>
        {campaign && <StatusPill status={campaign.status} />}
      </div>

      <Banner msg={msg} />

      {/* Editor à esquerda (mais largo), ações/estatísticas à direita — usa a tela
          toda e mantém os botões à vista sem rolar. Empilha < lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {/* Coluna principal — editor */}
      <div className="lg:col-span-2 space-y-5 min-w-0">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Assunto">
            <input className={inputCls} value={subject} disabled={!editable}
              onChange={(e) => setSubject(e.target.value)} placeholder="Assunto do e-mail" maxLength={300} />
          </Field>
          <Field label="Moldura" hint="A estrutura visual (cabeçalho/rodapé). Gerencie na aba Modelos.">
            {editable ? (
              <select className={inputCls} value={templateId === null ? "" : String(templateId)}
                onChange={(e) => setTemplateId(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Padrão (Configurações)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <input className={inputCls} disabled
                value={templates.find((t) => t.id === templateId)?.name ?? "Padrão (Configurações)"} />
            )}
          </Field>
        </div>

        <div>
          <label className={labelCls}>Conteúdo</label>
          {editable ? (
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Escreva o conteúdo da newsletter…"
              onUploadFile={async (file) => {
                const r = await adminApi.uploadImage(file, subject || "newsletter");
                return { url: r.url, mediaType: "image" as const };
              }}
            />
          ) : (
            <div className="prose-editor border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-900 max-h-[420px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: body || "<p class='text-slate-400'>(sem conteúdo)</p>" }} />
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            A moldura de marca e o rodapé de descadastro são adicionados automaticamente ao enviar.
          </p>
        </div>
      </div>
      </div>{/* fim da coluna principal */}

      {/* Coluna lateral — estatísticas / agenda / ações (sticky) */}
      <div className="space-y-5 min-w-0 lg:sticky lg:top-4">

      {/* Estatísticas da fila (campanhas já disparadas) */}
      {campaign && !editable && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300">Progresso do envio</h3>
            <span className="text-[12px] text-slate-500 dark:text-slate-400">
              {campaign.recipients} destinatário(s) · disparada {fmtDate(campaign.sentAt ?? campaign.updatedAt)}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(["pending", "sending", "sent", "failed", "dead"] as const).map((k) => {
              const n = queue?.find((q) => q.status === k)?.count ?? 0;
              return (
                <div key={k} className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{n}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{QUEUE_LABEL[k]}</p>
                </div>
              );
            })}
          </div>
          {queue === null && <p className="text-[12px] text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Carregando fila…</p>}
        </div>
      )}

      {/* Agendamento */}
      {editable && showSchedule && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300 flex items-center gap-2"><Calendar size={15} /> Agendar envio</h3>
          <div className="flex flex-col gap-3">
            <div className="space-y-1 w-full">
              <label className={labelCls}>Data e hora</label>
              <input type="datetime-local" className={inputCls} value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <button onClick={schedule} disabled={busy !== null} className={`${btnPrimary} w-full justify-center`}>
              {busy === "schedule" ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Confirmar agendamento
            </button>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">O horário segue o fuso do seu navegador.</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-col gap-2 [&>button]:w-full [&>button]:justify-center">
        {editable && (
          <>
            <button onClick={saveDraft} disabled={busy !== null} className={btnGhost}>
              {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar rascunho
            </button>
            <button onClick={sendNow} disabled={busy !== null} className={btnPrimary}>
              {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar agora
            </button>
            <button onClick={() => setShowSchedule((v) => !v)} disabled={busy !== null} className={btnGhost}>
              <Calendar size={15} /> {showSchedule ? "Ocultar agendamento" : "Agendar"}
            </button>
          </>
        )}
        {canCancel && (
          <button onClick={cancel} disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60 transition-colors">
            {busy === "cancel" ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Cancelar campanha
          </button>
        )}
      </div>

      </div>{/* fim da coluna lateral */}
      </div>{/* fim do grid de 2 colunas */}
    </div>
  );
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[] | null>(null);
  const [editing, setEditing] = useState<{ campaign: NewsletterCampaign | null } | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    setCampaigns(null);
    adminApi.listNewsletterCampaigns()
      .then((r) => setCampaigns(r.campaigns))
      .catch((e) => { setCampaigns([]); setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao carregar." }); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (editing) {
    return (
      <CampaignEditor
        campaign={editing.campaign}
        onClose={(changed) => { setEditing(null); if (changed) load(); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Banner msg={msg} />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={load} className={btnGhost} title="Recarregar">
            <RefreshCw size={15} /> Atualizar
          </button>
          <button type="button" onClick={() => setEditing({ campaign: null })} className={btnPrimary}>
            <Plus size={15} /> Nova campanha
          </button>
        </div>
      </div>

      {campaigns === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : campaigns.length === 0 ? (
        <div className="max-w-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center">
          <Send size={22} className="mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma campanha ainda</p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Crie a primeira e envie agora ou agende para depois.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Assunto</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Envio</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Data</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}
                  onClick={() => setEditing({ campaign: c })}
                  className="border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{c.subject || "(sem assunto)"}</p>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600 dark:text-slate-300 tabular-nums">
                    {c.status === "draft" ? "—" : (
                      <>{c.sentCount}/{c.recipients}{c.failedCount > 0 && <span className="text-red-500"> · {c.failedCount} falha(s)</span>}</>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400 text-[13px]">
                    {c.status === "scheduled" ? `⏰ ${fmtDate(c.scheduledAt)}` : fmtDate(c.sentAt ?? c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Aba Inscritos ────────────────────────────────────────────────────────────
const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  pending:      { label: "Pendente",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  confirmed:    { label: "Confirmado",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  unsubscribed: { label: "Descadastrado", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  bounced:      { label: "Rejeitado",     cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  complained:   { label: "Reclamou",      cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
};
const SOURCE_LABEL: Record<string, string> = { footer: "Rodapé", home_block: "Home" };
const FILTERS: { id: string; label: string; countKey: string }[] = [
  { id: "",             label: "Todos",         countKey: "all" },
  { id: "confirmed",    label: "Confirmados",   countKey: "confirmed" },
  { id: "pending",      label: "Pendentes",     countKey: "pending" },
  { id: "unsubscribed", label: "Descadastrados", countKey: "unsubscribed" },
];

function SubscribersTab() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NewsletterSubscribersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Busca com debounce; recarrega ao mudar filtro/página/termo ou ao clicar em
  // Atualizar (a lista não faz auto-refresh — status muda por ação externa, ex.:
  // descadastro por e-mail).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const h = setTimeout(() => {
      adminApi.listNewsletterSubscribers({ status: status || undefined, page, q: q || undefined })
        .then((r) => { if (alive) setData(r); })
        .catch((e) => { if (alive) setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao carregar." }); })
        .finally(() => { if (alive) setLoading(false); });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(h); };
  }, [status, page, q, reloadKey]);

  async function exportCsv() {
    setExporting(true); setMsg(null);
    try { await adminApi.downloadNewsletterSubscribersCsv(status || undefined); }
    catch (e) { setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao exportar." }); }
    finally { setExporting(false); }
  }

  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <Banner msg={msg} />

      {/* Filtros por status + busca + export */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} type="button"
            onClick={() => { setStatus(f.id); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              status === f.id
                ? "bg-[#0B2A66] text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
            {f.label}<span className="ml-1.5 opacity-70 tabular-nums">{counts[f.countKey] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} pl-8 w-56`}
              placeholder="Buscar e-mail…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} className={btnGhost} title="Recarregar">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting} className={btnGhost}>
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} CSV
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">E-mail</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">Origem</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">Inscrito em</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400"><Loader2 size={16} className="animate-spin inline mr-2" /> Carregando…</td></tr>
            ) : (data?.subscribers.length ?? 0) === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-[13px]">Nenhum inscrito encontrado.</td></tr>
            ) : (
              data!.subscribers.map((sub) => {
                const st = SUB_STATUS[sub.status] ?? { label: sub.status, cls: "bg-slate-100 text-slate-500" };
                return (
                  <tr key={sub.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-medium">{sub.email}</td>
                    <td className="px-4 py-3"><span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 dark:text-slate-400">{sub.source ? (SOURCE_LABEL[sub.source] ?? sub.source) : "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-500 dark:text-slate-400 text-[13px]">{fmtDate(sub.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-[13px] text-slate-500 dark:text-slate-400">
        <span>{total} inscrito(s){status ? ` · ${SUB_STATUS[status]?.label ?? status}` : ""}</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft size={15} /></button>
          <span className="tabular-nums">{page} / {maxPage}</span>
          <button type="button" disabled={page >= maxPage || loading} onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Modelos (biblioteca de molduras) ─────────────────────────────────────
/** Editor de uma moldura salva. `record` null = nova. */
function ModelEditor({ record, onClose }: { record: NewsletterTemplateRecord | null; onClose: (changed: boolean) => void }) {
  const [name, setName] = useState(record?.name ?? "");
  const [config, setConfig] = useState<NewsletterTemplate>(record?.config ?? {});
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const changedRef = useRef(false);

  async function save() {
    if (!name.trim()) { setMsg({ type: "err", text: "Dê um nome à moldura." }); return; }
    setBusy("save"); setMsg(null);
    try {
      if (record) await adminApi.updateNewsletterTemplate(record.id, { name: name.trim(), template: config });
      else await adminApi.createNewsletterTemplate({ name: name.trim(), template: config });
      changedRef.current = true;
      onClose(true);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
      setBusy(null);
    }
  }

  async function remove() {
    if (!record) return;
    if (!window.confirm(`Excluir a moldura "${record.name}"? Campanhas que a usam voltam à moldura Padrão.`)) return;
    setBusy("delete"); setMsg(null);
    try { await adminApi.deleteNewsletterTemplate(record.id); onClose(true); }
    catch (e) { setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao excluir." }); setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => onClose(changedRef.current)} className={btnGhost}>
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="flex items-center gap-2">
          {record && (
            <button type="button" onClick={remove} disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60 transition-colors">
              {busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
            </button>
          )}
          <button type="button" onClick={save} disabled={busy !== null} className={btnPrimary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar moldura
          </button>
        </div>
      </div>

      <Banner msg={msg} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <Field label="Nome da moldura">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Resumo da semana" maxLength={120} />
            </Field>
          </div>
          <ShellFields value={config} onChange={setConfig} onError={(text) => setMsg({ type: "err", text })} />
        </div>
        <div className="min-w-0 xl:sticky xl:top-4">
          <ShellPreview template={config} />
        </div>
      </div>
    </div>
  );
}

function ModelsTab() {
  const [templates, setTemplates] = useState<NewsletterTemplateRecord[] | null>(null);
  const [editing, setEditing] = useState<{ record: NewsletterTemplateRecord | null } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    setTemplates(null);
    adminApi.listNewsletterTemplates()
      .then((r) => setTemplates(r.templates))
      .catch((e) => { setTemplates([]); setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao carregar." }); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function duplicate(t: NewsletterTemplateRecord) {
    setBusyId(t.id); setMsg(null);
    try { await adminApi.createNewsletterTemplate({ name: `${t.name} (cópia)`, template: t.config }); load(); }
    catch (e) { setMsg({ type: "err", text: e instanceof Error ? e.message : "Falha ao duplicar." }); }
    finally { setBusyId(null); }
  }

  if (editing) {
    return <ModelEditor record={editing.record} onClose={(changed) => { setEditing(null); if (changed) load(); }} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Banner msg={msg} />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={load} className={btnGhost} title="Recarregar"><RefreshCw size={15} /> Atualizar</button>
          <button type="button" onClick={() => setEditing({ record: null })} className={btnPrimary}><Plus size={15} /> Nova moldura</button>
        </div>
      </div>

      {templates === null ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : templates.length === 0 ? (
        <div className="max-w-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center">
          <LayoutTemplate size={22} className="mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma moldura extra ainda</p>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Crie variações da moldura ou cole um HTML no modo avançado. A moldura Padrão fica em Configurações.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{t.name}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Editada {fmtDate(t.updatedAt)}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {t.config.headerHtml || t.config.footerHtml ? <><Code2 size={11} /> HTML</> : "Campos"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" onClick={() => setEditing({ record: t })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  Editar
                </button>
                <button type="button" onClick={() => duplicate(t)} disabled={busyId === t.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60">
                  {busyId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} Duplicar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[12px] text-slate-500 dark:text-slate-400">
        A moldura <strong>Padrão</strong> (usada por confirmações e campanhas sem escolha) fica na aba Configurações. Aqui você cria variações — inclusive colando HTML de e-mail no modo avançado.
      </p>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function Newsletter() {
  const [tab, setTab] = useState<Tab>("config");

  return (
    <AdminLayout title="Newsletter">
      <div className="space-y-6">
        {/* Subabas */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === id
                  ? "border-[#0B2A66] text-[#0B2A66] dark:text-blue-300 dark:border-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* ConfigTab fica sempre montado (só escondido) para não perder o
            formulário não-salvo — inclusive o toggle — ao trocar de subaba. */}
        <div className={tab === "config" ? "" : "hidden"}><ConfigTab /></div>
        {tab === "subscribers" && <SubscribersTab />}
        {tab === "campaigns" && <CampaignsTab />}
        {tab === "templates" && <ModelsTab />}
      </div>
    </AdminLayout>
  );
}
