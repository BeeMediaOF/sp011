import { useEffect, useState } from "react";
import { api } from "../api";
import { useLoad } from "../hooks";

interface MaskedSettings {
  aiProvider: string;
  aiModel?: string;
  ollamaBaseUrl?: string;
  fallbackToGemini?: boolean;
  aiDailyLimit?: number;
  hasOpenaiKey: boolean;
  geminiKeyHints: string[];
  collectionEnabled: boolean;
  collectionIntervalMinutes: number;
  collectionMaxPerCycle?: number;
  collectionMaxPerDay?: number;
  collectionStartHour?: number;
  collectionEndHour?: number;
  collectionDefaultFetchLimit?: number;
  maxPendingRewrites: number;
  rewriteEnabled: boolean;
  deliveryEnabled: boolean;
}

interface Quota {
  usedToday: number; dailyLimit: number; remaining: number;
  isOnCooldown: boolean; cooldownRemainingMs: number;
}

interface Prompts { global?: string; categories?: Record<string, string> }

export default function Settings() {
  const { data: settings, reload } = useLoad(() => api<MaskedSettings>("/settings"));
  const { data: quota } = useLoad(() => api<Quota>("/settings/ai-quota"));
  const { data: prompts, reload: reloadPrompts } = useLoad(() => api<Prompts>("/settings/prompts"));

  const [form, setForm] = useState<Partial<MaskedSettings> & { openaiApiKey?: string }>({});
  const [newKey, setNewKey] = useState("");
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  useEffect(() => { if (prompts) setGlobalPrompt(prompts.global ?? ""); }, [prompts]);

  const num = (v: unknown) => (v === "" || v == null ? undefined : Number(v));

  const save = async () => {
    setMsg("");
    try {
      await api("/settings", {
        method: "PUT",
        body: {
          aiProvider: form.aiProvider,
          aiModel: form.aiModel || undefined,
          ollamaBaseUrl: form.ollamaBaseUrl || undefined,
          fallbackToGemini: form.fallbackToGemini,
          aiDailyLimit: num(form.aiDailyLimit),
          openaiApiKey: form.openaiApiKey || undefined,
          collectionEnabled: form.collectionEnabled,
          collectionIntervalMinutes: num(form.collectionIntervalMinutes) ?? 20,
          collectionMaxPerCycle: num(form.collectionMaxPerCycle),
          collectionMaxPerDay: num(form.collectionMaxPerDay),
          collectionStartHour: num(form.collectionStartHour),
          collectionEndHour: num(form.collectionEndHour),
          collectionDefaultFetchLimit: num(form.collectionDefaultFetchLimit),
          maxPendingRewrites: num(form.maxPendingRewrites) ?? 30,
          rewriteEnabled: form.rewriteEnabled,
          deliveryEnabled: form.deliveryEnabled,
        },
      });
      setMsg("✔ Configurações salvas");
      setForm({ ...form, openaiApiKey: "" });
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const addKey = async () => {
    if (!newKey.trim()) return;
    await api("/settings/gemini-keys", { method: "POST", body: { key: newKey.trim() } });
    setNewKey("");
    reload();
  };

  const removeKey = async (hint: string) => {
    if (!confirm(`Remover a chave ${hint}?`)) return;
    await api(`/settings/gemini-keys/${hint.replace(/^\.+/, "")}`, { method: "DELETE" });
    reload();
  };

  const savePrompt = async () => {
    await api("/settings/prompts", {
      method: "PUT",
      body: { global: globalPrompt || undefined, categories: prompts?.categories ?? {} },
    });
    setMsg("✔ Prompt global salvo");
    reloadPrompts();
  };

  if (!settings) return <p className="muted">Carregando…</p>;

  return (
    <>
      {msg && <div className="card">{msg}</div>}

      <div className="card">
        <h3>Inteligência Artificial</h3>
        {quota && (
          <p className="muted">
            Hoje: {quota.usedToday}/{quota.dailyLimit} requisições
            {quota.isOnCooldown && <span className="badge warn" style={{ marginLeft: 8 }}>em cooldown ({Math.ceil(quota.cooldownRemainingMs / 1000)}s)</span>}
          </p>
        )}
        <div className="row">
          <div>
            <label>Provider</label>
            <select value={form.aiProvider ?? "gemini"} onChange={(e) => setForm({ ...form, aiProvider: e.target.value })}>
              <option value="gemini">Gemini (rodízio de chaves)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (self-hosted)</option>
            </select>
          </div>
          <div>
            <label>Modelo (vazio = padrão do provider)</label>
            <input value={form.aiModel ?? ""} onChange={(e) => setForm({ ...form, aiModel: e.target.value })} placeholder="gemini-2.5-flash" />
          </div>
          <div>
            <label>Limite diário de requisições</label>
            <input type="number" value={form.aiDailyLimit ?? ""} onChange={(e) => setForm({ ...form, aiDailyLimit: Number(e.target.value) || undefined })} placeholder="1200" />
          </div>
        </div>

        <label>Chaves Gemini</label>
        <div className="row">
          {settings.geminiKeyHints.map((hint) => (
            <span key={hint} className="badge fit">
              {hint}{" "}
              <a href="#remover" onClick={(e) => { e.preventDefault(); void removeKey(hint); }}>×</a>
            </span>
          ))}
          {settings.geminiKeyHints.length === 0 && <span className="muted fit">nenhuma chave no painel (env GEMINI_API_KEY ainda vale)</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="Nova chave Gemini (AIza…)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <button className="fit secondary" onClick={addKey}>Adicionar chave</button>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>OpenAI API key {settings.hasOpenaiKey ? "(já configurada — preencha p/ trocar)" : ""}</label>
            <input type="password" value={form.openaiApiKey ?? ""} onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })} />
          </div>
          <div>
            <label>Ollama base URL</label>
            <input value={form.ollamaBaseUrl ?? ""} onChange={(e) => setForm({ ...form, ollamaBaseUrl: e.target.value })} placeholder="http://ollama:11434" />
          </div>
          <label className="fit row" style={{ margin: "24px 0 0" }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.fallbackToGemini ?? true} onChange={(e) => setForm({ ...form, fallbackToGemini: e.target.checked })} />
            Ollama caiu → usar Gemini
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Coleta</h3>
        <div className="row">
          <label className="fit row" style={{ margin: 0 }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.collectionEnabled ?? true} onChange={(e) => setForm({ ...form, collectionEnabled: e.target.checked })} />
            Coleta automática ligada
          </label>
          <label className="fit row" style={{ margin: 0 }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.rewriteEnabled ?? true} onChange={(e) => setForm({ ...form, rewriteEnabled: e.target.checked })} />
            Reescrita ligada
          </label>
          <label className="fit row" style={{ margin: 0 }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.deliveryEnabled ?? true} onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })} />
            Distribuição/entregas ligadas
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Intervalo entre ciclos (min)</label>
            <input type="number" value={form.collectionIntervalMinutes ?? 20} onChange={(e) => setForm({ ...form, collectionIntervalMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label>Máx. por ciclo</label>
            <input type="number" value={form.collectionMaxPerCycle ?? ""} onChange={(e) => setForm({ ...form, collectionMaxPerCycle: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <label>Máx. por dia</label>
            <input type="number" value={form.collectionMaxPerDay ?? ""} onChange={(e) => setForm({ ...form, collectionMaxPerDay: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <label>Janela: hora início (BR)</label>
            <input type="number" min={0} max={23} value={form.collectionStartHour ?? ""} onChange={(e) => setForm({ ...form, collectionStartHour: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div>
            <label>Janela: hora fim (BR)</label>
            <input type="number" min={0} max={23} value={form.collectionEndHour ?? ""} onChange={(e) => setForm({ ...form, collectionEndHour: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
          <div>
            <label>Artigos por fonte (padrão)</label>
            <input type="number" value={form.collectionDefaultFetchLimit ?? ""} onChange={(e) => setForm({ ...form, collectionDefaultFetchLimit: Number(e.target.value) || undefined })} />
          </div>
          <div>
            <label>Backpressure (máx. na fila)</label>
            <input type="number" value={form.maxPendingRewrites ?? 30} onChange={(e) => setForm({ ...form, maxPendingRewrites: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={save}>Salvar configurações</button>
        </div>
      </div>

      <div className="card">
        <h3>Prompt global de reescrita</h3>
        <p className="muted">Hierarquia: prompt da fonte &gt; da categoria &gt; global &gt; padrão do sistema. Vazio = usa o padrão.</p>
        <textarea style={{ minHeight: 200 }} value={globalPrompt} onChange={(e) => setGlobalPrompt(e.target.value)} placeholder="Use {{TITULO}}, {{TEXTO}}, {{FONTE}}, {{CREDITO}}" />
        <div style={{ marginTop: 10 }}>
          <button onClick={savePrompt}>Salvar prompt</button>
        </div>
      </div>
    </>
  );
}
