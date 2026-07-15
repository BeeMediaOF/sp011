import { useMemo, useState } from "react";
import { api } from "../api";
import { fmtDate, useLoad } from "../hooks";

interface Source {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  scheduleHours: number;
  fetchLimit: number | null;
  giveCredit: boolean;
  customPrompt: string | null;
  language: string;
  lastFetchedAt: string | null;
}

const EMPTY = { name: "", url: "", category: "geral", scheduleHours: "4", fetchLimit: "", giveCredit: false, active: true, customPrompt: "", language: "pt-BR" };

// ─── Visual de marcas (mesmo padrão do admin do blog: RSSManager) ─────────────
/** "Agência Brasil - Política" → "Agência Brasil" */
function extractPublisher(name: string): string {
  const idx = name.search(/\s[–\-]\s/);
  return idx > 0 ? name.slice(0, idx).trim() : name;
}

function srcInitials(name: string): string {
  const words = name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim().split(/\s+/);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

const SRC_PALETTE = ["#E71D36", "#0B2A66", "#2563EB", "#16A34A", "#F97316", "#9333EA", "#0EA5E9", "#DC2626"];
function srcColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = key.charCodeAt(i) + ((h << 5) - h);
  return SRC_PALETTE[Math.abs(h) % SRC_PALETTE.length] ?? "#0B2A66";
}

function catLabel(c: string): string {
  return (c || "geral").replace(/-/g, " ").toUpperCase();
}

interface BlogLite {
  id: string;
  name: string;
}

export default function Sources() {
  // Filtro por blog: o backend devolve só as fontes que alguma regra ativa
  // do blog pode casar (categoria/fonte) — "fontes cadastradas nele".
  const [blogFilter, setBlogFilter] = useState("");
  const { data: sources, error, reload } = useLoad(
    () => api<Source[]>(`/sources${blogFilter ? `?blogId=${encodeURIComponent(blogFilter)}` : ""}`),
    [blogFilter],
  );
  const { data: blogs } = useLoad(() => api<BlogLite[]>("/blogs"));
  const [editing, setEditing] = useState<Partial<Source> | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const list = sources ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q));
  }, [sources, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Source[]>();
    for (const src of filtered) {
      const pub = extractPublisher(src.name);
      if (!map.has(pub)) map.set(pub, []);
      map.get(pub)!.push(src);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([publisher, srcs]) => ({ publisher, srcs }));
  }, [filtered]);

  function toggleGroup(pub: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(pub)) next.delete(pub); else next.add(pub);
      return next;
    });
  }

  const openNew = () => { setForm(EMPTY); setEditing({}); };
  const openEdit = (s: Source) => {
    setForm({
      name: s.name, url: s.url, category: s.category,
      scheduleHours: String(s.scheduleHours), fetchLimit: s.fetchLimit?.toString() ?? "",
      giveCredit: s.giveCredit, active: s.active, customPrompt: s.customPrompt ?? "",
      language: s.language === "en" ? "en" : "pt-BR",
    });
    setEditing(s);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.name, url: form.url, category: form.category,
        scheduleHours: Number(form.scheduleHours) || 0,
        fetchLimit: form.fetchLimit ? Number(form.fetchLimit) : null,
        giveCredit: form.giveCredit, active: form.active,
        customPrompt: form.customPrompt || null,
        language: form.language,
      };
      if (editing?.id) await api(`/sources/${editing.id}`, { method: "PATCH", body });
      else await api("/sources", { method: "POST", body });
      setEditing(null);
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: Source) => {
    try {
      await api(`/sources/${s.id}`, { method: "PATCH", body: { active: !s.active } });
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const run = async (s: Source) => {
    setMsg(`Coletando ${s.name}…`);
    try {
      const res = await api<{ collected: number }>(`/sources/${s.id}/run`, { method: "POST" });
      setMsg(`✔ ${s.name}: ${res.collected} notícia(s) nova(s) na fila`);
      reload();
    } catch (err) {
      setMsg(`✖ ${String((err as Error).message)}`);
    }
  };

  const runCycle = async () => {
    setMsg("Rodando ciclo completo…");
    const res = await api<{ collected: number; skipped?: string }>("/sources/run-cycle", { method: "POST" });
    setMsg(res.skipped ? `Ciclo pulado: ${res.skipped}` : `✔ Ciclo coletou ${res.collected} notícia(s)`);
    reload();
  };

  const remove = async (s: Source) => {
    if (!confirm(`Remover a fonte "${s.name}"?`)) return;
    await api(`/sources/${s.id}`, { method: "DELETE" });
    reload();
  };

  return (
    <>
      <div className="toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar fonte, URL ou categoria…" style={{ maxWidth: 280 }} />
        <select value={blogFilter} onChange={(e) => setBlogFilter(e.target.value)}
          style={{ maxWidth: 220 }} title="Mostrar só as fontes que as regras deste blog alcançam">
          <option value="">Todos os blogs</option>
          {(blogs ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="grow" />
        <button className="secondary" onClick={runCycle}>Rodar ciclo agora</button>
        <button onClick={openNew}>+ Nova fonte</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card">{msg}</div>}

      <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
        {grouped.length} marca{grouped.length !== 1 ? "s" : ""} · {filtered.length} fonte{filtered.length !== 1 ? "s" : ""}
        {blogFilter && (blogs ?? []).find((b) => b.id === blogFilter) &&
          ` · alcançadas pelas regras de ${(blogs ?? []).find((b) => b.id === blogFilter)!.name}`}
      </p>

      {grouped.length === 0 && <div className="card muted">Nenhuma fonte ainda.</div>}

      <div>
        {grouped.map(({ publisher, srcs }) => {
          const isOpen = openGroups.has(publisher);
          const activeCount = srcs.filter((s) => s.active).length;
          return (
            <div key={publisher} className="src-group">
              <button type="button" className="src-group-head" onClick={() => toggleGroup(publisher)}>
                <span className="src-avatar" style={{ background: srcColor(publisher) }}>{srcInitials(publisher)}</span>
                <span className="src-group-info">
                  <span className="src-group-name">{publisher}</span>
                  <span className="src-badges">
                    {srcs.map((s) => (
                      <span key={s.id} className={`src-badge${s.active ? "" : " off"}`}>{catLabel(s.category)}</span>
                    ))}
                  </span>
                </span>
                <span className="src-count">{activeCount}/{srcs.length} ativa{srcs.length !== 1 ? "s" : ""}</span>
                <span className={`src-chevron${isOpen ? " open" : ""}`} aria-hidden>▾</span>
              </button>

              {isOpen && (
                <div className="src-rows">
                  {srcs.map((s) => (
                    <div key={s.id} className="src-row">
                      <div className="src-row-main">
                        <div>
                          <b>{s.name}</b>
                          {s.language === "en" && <span className="badge" style={{ marginLeft: 6 }}>EN</span>}
                          {!s.active && <span className="badge err" style={{ marginLeft: 6 }}>inativa</span>}
                          {s.giveCredit && <span className="badge" style={{ marginLeft: 6 }}>com crédito</span>}
                        </div>
                        <div className="muted mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{s.url}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {catLabel(s.category)} · {s.scheduleHours > 0 ? `a cada ${s.scheduleHours}h` : "manual"} · limite {s.fetchLimit ?? "padrão"} · última coleta {fmtDate(s.lastFetchedAt)}
                        </div>
                      </div>
                      <div className="src-row-actions">
                        <button className="secondary small" onClick={() => toggleActive(s)}>{s.active ? "Desligar" : "Ligar"}</button>{" "}
                        <button className="secondary small" onClick={() => run(s)}>Coletar</button>{" "}
                        <button className="secondary small" onClick={() => openEdit(s)}>Editar</button>{" "}
                        <button className="danger small" onClick={() => remove(s)}>Remover</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? `Editar: ${editing.name}` : "Nova fonte"}</h2>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>URL do feed RSS (ou homepage — scraping automático de fallback)</label>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <div className="row">
              <div>
                <label>Categoria</label>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <label>Coletar a cada (horas; 0 = só manual)</label>
                <input type="number" value={form.scheduleHours} onChange={(e) => setForm({ ...form, scheduleHours: e.target.value })} />
              </div>
              <div>
                <label>Artigos por rodada (vazio = padrão)</label>
                <input type="number" value={form.fetchLimit} onChange={(e) => setForm({ ...form, fetchLimit: e.target.value })} />
              </div>
              <div>
                <label>Idioma do conteúdo</label>
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">Inglês</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.giveCredit} onChange={(e) => setForm({ ...form, giveCredit: e.target.checked })} />
                Citar a fonte no texto
              </label>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativa
              </label>
            </div>
            <label>Prompt customizado (vazio = hierarquia categoria/global/padrão)</label>
            <textarea value={form.customPrompt} onChange={(e) => setForm({ ...form, customPrompt: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.name || !form.url}>Salvar</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
