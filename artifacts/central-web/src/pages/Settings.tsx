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
  openaiKeyHints: string[];
  perplexityKeyHints: string[];
  openaiBaseUrl?: string;
  hasPerplexityKey: boolean;
  perplexityModel?: string;
  fallbackPerplexityEnabled?: boolean;
  aiBoostEnabled?: boolean;
  aiBoostProvider?: string;
  aiBoostTimesPerDay?: number;
  aiBoostBatchSize?: number;
  aiBoostQueueThreshold?: number;
  aiBoostMaxPerDay?: number;
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
  translationProvider?: string;
  translationModel?: string;
  translationPromptTemplate?: string;
  translationMaxPerDay?: number;
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

  const [form, setForm] = useState<Partial<MaskedSettings> & { openaiApiKey?: string; perplexityApiKey?: string }>({});
  const [newKey, setNewKey] = useState("");
  const [newOpenaiKey, setNewOpenaiKey] = useState("");
  const [newPplxKey, setNewPplxKey] = useState("");
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
          openaiBaseUrl: form.openaiBaseUrl || undefined,
          perplexityApiKey: form.perplexityApiKey || undefined,
          perplexityModel: form.perplexityModel || undefined,
          fallbackPerplexityEnabled: form.fallbackPerplexityEnabled,
          aiBoostEnabled: form.aiBoostEnabled,
          aiBoostProvider: form.aiBoostProvider,
          aiBoostTimesPerDay: num(form.aiBoostTimesPerDay),
          aiBoostBatchSize: num(form.aiBoostBatchSize),
          aiBoostQueueThreshold: num(form.aiBoostQueueThreshold),
          aiBoostMaxPerDay: num(form.aiBoostMaxPerDay),
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
          translationProvider: form.translationProvider || undefined,
          translationModel: form.translationModel || undefined,
          translationPromptTemplate: form.translationPromptTemplate || undefined,
          translationMaxPerDay: num(form.translationMaxPerDay),
        },
      });
      setMsg("✔ Configurações salvas");
      setForm({ ...form, openaiApiKey: "", perplexityApiKey: "" });
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const addPoolKey = async (pool: string, key: string, clear: () => void) => {
    if (!key.trim()) return;
    await api(`/settings/${pool}`, { method: "POST", body: { key: key.trim() } });
    clear();
    reload();
  };

  const removePoolKey = async (pool: string, hint: string) => {
    if (!confirm(`Remover a chave ${hint}?`)) return;
    await api(`/settings/${pool}/${hint.replace(/^\.+/, "")}`, { method: "DELETE" });
    reload();
  };

  /** Badges de um pool de chaves + campo de adicionar (mesma UI p/ os 3 provedores). */
  const keyPool = (pool: string, hints: string[], value: string, setValue: (v: string) => void, placeholder: string, empty: string) => (
    <>
      <div className="row">
        {hints.map((hint) => (
          <span key={hint} className="badge fit">
            {hint}{" "}
            <a href="#remover" onClick={(e) => { e.preventDefault(); void removePoolKey(pool, hint); }}>×</a>
          </span>
        ))}
        {hints.length === 0 && <span className="muted fit">{empty}</span>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="fit secondary" onClick={() => void addPoolKey(pool, value, () => setValue(""))}>Adicionar chave</button>
      </div>
    </>
  );

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
        {keyPool("gemini-keys", settings.geminiKeyHints, newKey, setNewKey,
          "Nova chave Gemini (AIza…)", "nenhuma chave no painel (env GEMINI_API_KEY ainda vale)")}

        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>OpenAI API key {settings.hasOpenaiKey ? "(já configurada — preencha p/ trocar)" : ""}</label>
            <input type="password" value={form.openaiApiKey ?? ""} onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })} />
          </div>
          <div>
            <label>Base URL OpenAI-compatível (vazio = api.openai.com)</label>
            <input value={form.openaiBaseUrl ?? ""} onChange={(e) => setForm({ ...form, openaiBaseUrl: e.target.value })} placeholder="https://api.groq.com/openai — Groq/OpenRouter/DeepSeek…" />
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

        <label style={{ marginTop: 10 }}>Chaves OpenAI adicionais (rodízio entre elas + a principal)</label>
        {keyPool("openai-keys", settings.openaiKeyHints ?? [], newOpenaiKey, setNewOpenaiKey,
          "Nova chave OpenAI/compatível (sk-…)", "nenhuma chave adicional")}
      </div>

      <div className="card">
        <h3>IAs de Apoio</h3>
        <p className="muted">
          Mesmo funcionamento do blog: a Perplexity assume quando o Gemini fica sem cota, e o
          reforço automático usa Gemini/Perplexity para drenar a fila sem esperar o Ollama.
        </p>
        <div className="row">
          <div>
            <label>Chave da Perplexity {settings.hasPerplexityKey ? "✓ configurada (preencha p/ substituir)" : ""}</label>
            <input type="password" value={form.perplexityApiKey ?? ""} onChange={(e) => setForm({ ...form, perplexityApiKey: e.target.value })} placeholder={settings.hasPerplexityKey ? "••••••••" : "pplx-…"} />
          </div>
          <div>
            <label>Modelo Perplexity</label>
            <input value={form.perplexityModel ?? ""} onChange={(e) => setForm({ ...form, perplexityModel: e.target.value })} placeholder="sonar" />
          </div>
        </div>
        <label style={{ marginTop: 10 }}>Chaves Perplexity adicionais (rodízio; erro de cota pula p/ a próxima)</label>
        {keyPool("perplexity-keys", settings.perplexityKeyHints ?? [], newPplxKey, setNewPplxKey,
          "Nova chave Perplexity (pplx-…)", "nenhuma chave adicional")}
        <div className="row" style={{ marginTop: 10 }}>
          <label className="fit row" style={{ margin: 0 }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.fallbackPerplexityEnabled ?? true} onChange={(e) => setForm({ ...form, fallbackPerplexityEnabled: e.target.checked })} />
            Perplexity assume se o Gemini ficar sem cota
          </label>
          <label className="fit row" style={{ margin: 0 }}>
            <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.aiBoostEnabled ?? false} onChange={(e) => setForm({ ...form, aiBoostEnabled: e.target.checked })} />
            Reforço automático da fila
          </label>
        </div>
        {(form.aiBoostEnabled ?? false) && (
          <div className="row" style={{ marginTop: 10 }}>
            <div>
              <label>IA usada no reforço</label>
              <select value={form.aiBoostProvider ?? "both"} onChange={(e) => setForm({ ...form, aiBoostProvider: e.target.value })}>
                <option value="both">Ambas (alterna Gemini e Perplexity)</option>
                <option value="gemini">Somente Gemini</option>
                <option value="perplexity">Somente Perplexity</option>
              </select>
            </div>
            <div>
              <label>Rajadas por dia (0 = off)</label>
              <input type="number" min={0} max={48} value={form.aiBoostTimesPerDay ?? 0} onChange={(e) => setForm({ ...form, aiBoostTimesPerDay: Number(e.target.value) })} />
            </div>
            <div>
              <label>Artigos por rajada</label>
              <input type="number" min={1} value={form.aiBoostBatchSize ?? 10} onChange={(e) => setForm({ ...form, aiBoostBatchSize: Number(e.target.value) })} />
            </div>
            <div>
              <label>Reforçar c/ fila ≥ (0 = off)</label>
              <input type="number" min={0} value={form.aiBoostQueueThreshold ?? 0} onChange={(e) => setForm({ ...form, aiBoostQueueThreshold: Number(e.target.value) })} />
            </div>
            <div>
              <label>Máx. de apoio por dia (0 = ∞)</label>
              <input type="number" min={0} value={form.aiBoostMaxPerDay ?? 0} onChange={(e) => setForm({ ...form, aiBoostMaxPerDay: Number(e.target.value) })} />
            </div>
          </div>
        )}
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
      </div>

      <div className="card">
        <h3>Tradução &amp; Classificação</h3>
        <p className="muted">
          Entregas para blogs em idioma diferente da fonte são traduzidas antes de aprovar/enviar;
          blogs com categorias definidas (aba Blogs) ganham a categoria decidida pela IA na mesma
          etapa. Regra com categoria explícita sempre vence; indecisão cai em "others".
        </p>
        <div className="row">
          <div>
            <label>Provider da tradução</label>
            <select value={form.translationProvider ?? "gemini"} onChange={(e) => setForm({ ...form, translationProvider: e.target.value })}>
              <option value="gemini">Gemini (rodízio de chaves)</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (self-hosted)</option>
            </select>
          </div>
          <div>
            <label>Modelo (vazio = padrão do provider)</label>
            <input value={form.translationModel ?? ""} onChange={(e) => setForm({ ...form, translationModel: e.target.value })} placeholder="gemini-2.5-flash" />
          </div>
          <div>
            <label>Máx. traduções por dia (0 = ∞)</label>
            <input type="number" min={0} value={form.translationMaxPerDay ?? 0} onChange={(e) => setForm({ ...form, translationMaxPerDay: Number(e.target.value) })} />
          </div>
        </div>
        <label style={{ marginTop: 10 }}>Prompt de tradução customizado (vazio = padrão do sistema)</label>
        <textarea
          style={{ minHeight: 120 }}
          value={form.translationPromptTemplate ?? ""}
          onChange={(e) => setForm({ ...form, translationPromptTemplate: e.target.value })}
          placeholder="Use {{IDIOMA_DESTINO}}, {{TITULO}}, {{SUBTITULO}}, {{CONTEUDO}}, {{CATEGORIAS}}…"
        />
      </div>

      <div className="card">
        <h3>Prompt global de reescrita</h3>
        <p className="muted">Hierarquia: prompt da fonte &gt; da categoria &gt; global &gt; padrão do sistema. Vazio = usa o padrão.</p>
        <textarea style={{ minHeight: 200 }} value={globalPrompt} onChange={(e) => setGlobalPrompt(e.target.value)} placeholder="Use {{TITULO}}, {{TEXTO}}, {{FONTE}}, {{CREDITO}}" />
        <div style={{ marginTop: 10 }}>
          <button onClick={savePrompt}>Salvar prompt</button>
        </div>
      </div>

      {/* Sempre visível (sticky): salva os cards de IA, IAs de Apoio e Coleta. */}
      <div className="savebar">
        {msg && <span className="savebar-msg">{msg}</span>}
        <button onClick={save}>Salvar configurações</button>
      </div>
    </>
  );
}
