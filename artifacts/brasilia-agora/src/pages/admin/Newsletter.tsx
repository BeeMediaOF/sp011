import { useState, useEffect, useCallback } from "react";
import {
  Mail, Users, Send, Settings as SettingsIcon, Save, TestTube2,
  Loader2, CheckCircle, AlertCircle, Info,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { adminApi, type NewsletterSettings } from "../../lib/adminApi";

// ─── Subabas ────────────────────────────────────────────────────────────────
type Tab = "subscribers" | "campaigns" | "config";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "subscribers", label: "Inscritos",      icon: Users },
  { id: "campaigns",   label: "Campanhas",      icon: Send },
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
  newsletterTemplate: { accentColor: "", logoMode: "wordmark", headerText: "", footerText: "", signature: "" },
};

// ─── Estilos compartilhados ──────────────────────────────────────────────────
const inputCls =
  "w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/30 " +
  "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 " +
  "placeholder:text-slate-400 dark:placeholder:text-slate-500";
const labelCls = "block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
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
  const setTpl = useCallback((k: keyof NewsletterSettings["newsletterTemplate"], v: string) => {
    setForm((f) => ({ ...f, newsletterTemplate: { ...f.newsletterTemplate, [k]: v } }));
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

  const tpl = form.newsletterTemplate;
  const accent = tpl.accentColor || "#0B2A66";

  return (
    <div className="max-w-3xl space-y-6">
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          msg.type === "ok"
            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
            : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300"}`}>
          {msg.type === "ok" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* Liga/desliga */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Newsletter ativa</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Desligada, a captura no site segue funcionando, mas nenhum e-mail é enviado.</p>
        </div>
        <button
          onClick={() => set("newsletterEnabled", !form.newsletterEnabled)}
          className={`w-12 h-6 rounded-full relative transition-colors ${form.newsletterEnabled ? "bg-[#0B2A66]" : "bg-slate-300 dark:bg-slate-600"}`}
          aria-pressed={form.newsletterEnabled}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.newsletterEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
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

      {/* Modelo do e-mail */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#0B2A66] dark:text-blue-300">Modelo do e-mail</h3>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-2">
          A moldura de marca que envolve o corpo de cada campanha. O descadastro obrigatório é adicionado automaticamente no rodapé.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cor de destaque">
            <div className="flex items-center gap-2">
              <input type="color" value={accent} onChange={(e) => setTpl("accentColor", e.target.value)} className="w-10 h-9 rounded-lg border border-slate-200 dark:border-slate-600 bg-transparent cursor-pointer" />
              <input className={inputCls} value={tpl.accentColor ?? ""} onChange={(e) => setTpl("accentColor", e.target.value)} placeholder="#0B2A66 (vazio = cor do painel)" />
            </div>
          </Field>
          <Field label="Cabeçalho">
            <select className={inputCls} value={tpl.logoMode ?? "wordmark"} onChange={(e) => setTpl("logoMode", e.target.value)}>
              <option value="wordmark">Nome do site no topo</option>
              <option value="none">Sem cabeçalho de marca</option>
            </select>
          </Field>
          <Field label="Texto do cabeçalho (opcional)" hint="Vazio = nome do remetente."><input className={inputCls} value={tpl.headerText ?? ""} onChange={(e) => setTpl("headerText", e.target.value)} /></Field>
          <Field label="Assinatura (opcional)"><input className={inputCls} value={tpl.signature ?? ""} onChange={(e) => setTpl("signature", e.target.value)} placeholder="Equipe SP011" /></Field>
          <div className="sm:col-span-2">
            <Field label="Texto do rodapé (opcional)"><textarea className={`${inputCls} min-h-[70px] resize-y`} value={tpl.footerText ?? ""} onChange={(e) => setTpl("footerText", e.target.value)} placeholder="Endereço, CNPJ ou aviso legal…" /></Field>
          </div>
        </div>
      </section>

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving || testing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B2A66] text-white text-sm font-semibold hover:bg-[#0a2255] disabled:opacity-60 transition-colors">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
        </button>
        <button onClick={test} disabled={saving || testing}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#0B2A66] text-[#0B2A66] dark:text-blue-300 dark:border-blue-400 text-sm font-semibold hover:bg-[#0B2A66]/5 disabled:opacity-60 transition-colors">
          {testing ? <Loader2 size={15} className="animate-spin" /> : <TestTube2 size={15} />} Enviar e-mail de teste
        </button>
      </div>
    </div>
  );
}

// ─── Placeholder das abas das próximas fases ──────────────────────────────────
function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="max-w-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center">
      <Info size={22} className="mx-auto text-slate-400 mb-3" />
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{desc}</p>
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

        {tab === "config" && <ConfigTab />}
        {tab === "subscribers" && <ComingSoon title="Lista de inscritos" desc="A gestão de inscritos e a exportação CSV chegam na etapa final da newsletter." />}
        {tab === "campaigns" && <ComingSoon title="Campanhas" desc="O editor de campanhas e o envio (manual/agendado) chegam junto do motor de disparo." />}
      </div>
    </AdminLayout>
  );
}
