import { useState } from "react";
import {
  Plus, Globe, ExternalLink, Pencil, Trash2, KeyRound, PlugZap, RefreshCw,
  ShieldCheck, Languages, Gauge, Timer, Radio, Eye, Share2, AlertTriangle, Power,
  Rss,
} from "lucide-react";
import { api } from "../api";
import { nameColor, statusLabel, timeAgo, useLoad } from "../hooks";
import { fmtNum } from "../charts";
import { Kpi } from "../ui";
import BlogSocialTab from "./BlogSocialTab";

export interface BlogCategory { slug: string; hint?: string }

export interface Blog {
  id: string;
  name: string;
  domain: string | null;
  apiUrl: string;
  hasSecret: boolean;
  isActive: boolean;
  requireApproval: boolean;
  deliveryMode: string;
  maxPostsPerDay: number | null;
  minMinutesBetweenPosts: number | null;
  language: string;
  titleCase: string;
  categories: BlogCategory[] | null;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
  notes: string | null;
}

const EMPTY = {
  name: "", domain: "", apiUrl: "", deliveryMode: "publish",
  requireApproval: false, isActive: true,
  maxPostsPerDay: "", minMinutesBetweenPosts: "", notes: "",
  language: "pt-BR", titleCase: "original", categoriesText: "",
};

// Uma categoria por linha, "slug: dica p/ a IA" (dica opcional).
function parseCategories(text: string): BlogCategory[] | null {
  const out: BlogCategory[] = [];
  for (const line of text.split("\n")) {
    const [rawSlug, ...rest] = line.split(":");
    const slug = (rawSlug ?? "").trim().toLowerCase();
    if (!slug || out.some((c) => c.slug === slug)) continue;
    const hint = rest.join(":").trim();
    out.push(hint ? { slug, hint } : { slug });
  }
  return out.length > 0 ? out : null;
}

function categoriesToText(cats: BlogCategory[] | null): string {
  return (cats ?? []).map((c) => (c.hint ? `${c.slug}: ${c.hint}` : c.slug)).join("\n");
}

// Pré-preenchimento com a taxonomia do KSports (menu decidido no starter).
const KSPORTS_CATEGORIES_TEXT = [
  "world-cup: FIFA World Cup",
  "football: club & international soccer (futebol)",
  "volleyball: volleyball (vôlei)",
  "tennis: tennis",
  "formula-1: Formula 1 / motorsport",
  "nfl: NFL / american football",
  "esports: e-sports & competitive gaming",
  "others: anything that does not fit the categories above",
].join("\n");

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export default function Blogs() {
  const { data: blogs, error, loading, reload } = useLoad(() => api<Blog[]>("/blogs"));
  const [editing, setEditing] = useState<Partial<Blog> | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalTab, setModalTab] = useState<"geral" | "social">("geral");

  const openNew = () => { setForm(EMPTY); setEditing({}); setMsg(""); setModalTab("geral"); };
  const openEdit = (b: Blog) => {
    setForm({
      name: b.name, domain: b.domain ?? "", apiUrl: b.apiUrl,
      deliveryMode: b.deliveryMode, requireApproval: b.requireApproval, isActive: b.isActive,
      maxPostsPerDay: b.maxPostsPerDay?.toString() ?? "",
      minMinutesBetweenPosts: b.minMinutesBetweenPosts?.toString() ?? "",
      notes: b.notes ?? "",
      language: b.language === "en" ? "en" : "pt-BR",
      titleCase: b.titleCase ?? "original",
      categoriesText: categoriesToText(b.categories),
    });
    setEditing(b);
    setMsg("");
    setModalTab("geral");
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const body = {
        name: form.name, domain: form.domain || null, apiUrl: form.apiUrl,
        deliveryMode: form.deliveryMode, requireApproval: form.requireApproval, isActive: form.isActive,
        maxPostsPerDay: form.maxPostsPerDay ? Number(form.maxPostsPerDay) : null,
        minMinutesBetweenPosts: form.minMinutesBetweenPosts ? Number(form.minMinutesBetweenPosts) : null,
        language: form.language,
        titleCase: form.titleCase,
        categories: parseCategories(form.categoriesText),
        notes: form.notes || null,
      };
      if (editing?.id) {
        await api(`/blogs/${editing.id}`, { method: "PATCH", body });
        setEditing(null);
      } else {
        const res = await api<{ ingestSecret: string }>("/blogs", { method: "POST", body });
        setSecret(res.ingestSecret);
        setEditing(null);
      }
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const test = async (b: Blog) => {
    setMsg(`Testando ${b.name}…`);
    try {
      const res = await api<{ ok: boolean; httpStatus: number; error?: string }>(`/blogs/${b.id}/test`, { method: "POST" });
      setMsg(res.ok ? `✔ ${b.name} respondeu OK` : `✖ ${b.name}: ${res.error ?? `HTTP ${res.httpStatus}`}`);
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  /**
   * Manda para o blog a lista de fontes que as REGRAS dele casam — é o que o
   * painel de Fontes RSS do blog passa a exibir (tudo inativo; quem coleta
   * continua sendo a central). Idempotente: pode rodar quantas vezes quiser.
   */
  const syncSources = async (b: Blog) => {
    setMsg(`Sincronizando fontes de ${b.name}…`);
    try {
      const res = await api<{ ok: boolean; enviadas: number; httpStatus: number; error?: string; body?: { inseridas?: number; removidas?: number } }>(
        `/blogs/${b.id}/sync-sources`, { method: "POST" },
      );
      setMsg(res.ok
        ? `✔ ${b.name}: ${res.enviadas} fontes (${res.body?.inseridas ?? 0} novas, ${res.body?.removidas ?? 0} removidas)`
        : `✖ ${b.name}: ${res.error ?? `HTTP ${res.httpStatus}`}`);
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const syncAll = async () => {
    if (!confirm("Sincronizar as fontes de TODOS os blogs ativos com as regras de distribuição?")) return;
    setMsg("Sincronizando fontes de todos os blogs…");
    try {
      const res = await api<{ total: number; ok: number }>("/blogs/sync-sources", { method: "POST" });
      setMsg(`✔ Fontes sincronizadas em ${res.ok}/${res.total} blogs`);
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };

  const rotate = async (b: Blog) => {
    if (!confirm(`Gerar um NOVO segredo para "${b.name}"? O segredo atual deixa de funcionar imediatamente.`)) return;
    const res = await api<{ ingestSecret: string }>(`/blogs/${b.id}/rotate-secret`, { method: "POST" });
    setSecret(res.ingestSecret);
    reload();
  };

  const remove = async (b: Blog) => {
    if (!confirm(`Remover o blog "${b.name}"? As entregas históricas permanecem no banco.`)) return;
    await api(`/blogs/${b.id}`, { method: "DELETE" });
    reload();
  };

  const list = blogs ?? [];
  const online = list.filter((b) => b.status === "online").length;
  const withProblem = list.filter((b) => b.isActive && b.status !== "online").length;
  const inactive = list.filter((b) => !b.isActive).length;

  return (
    <>
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 13 }}>
          {loading && list.length === 0
            ? "Carregando…"
            : `${fmtNum(list.length)} blog(s) conectado(s) à central`}
        </span>
        <div className="grow" />
        <button className="iconbtn" title="Atualizar" aria-label="Atualizar lista" onClick={reload}>
          <RefreshCw size={15} className={loading ? "spin-anim" : undefined} />
        </button>
        <button className="secondary" title="Enviar a cada blog as fontes que as regras dele casam"
          onClick={() => void syncAll()}>
          <Rss size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Sincronizar fontes
        </button>
        <button onClick={openNew}><Plus size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Novo blog</button>
      </div>

      {list.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <Kpi icon={Globe} tone="c-blue" value={fmtNum(list.length)} label="Blogs na rede" />
          <Kpi icon={Radio} tone="c-green" value={fmtNum(online)} label="Online agora" />
          <Kpi icon={AlertTriangle} tone={withProblem > 0 ? "c-red" : "c-amber"} value={fmtNum(withProblem)} label="Offline / com erro" />
          <Kpi icon={Power} tone="c-navy" value={fmtNum(inactive)} label="Inativos (pausados)" />
        </div>
      )}

      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card" role="status">{msg}</div>}

      {secret && (
        <div className="card">
          <b>Segredo de integração (exibido UMA única vez):</b>
          <div className="secret-box">{secret}</div>
          <p className="muted">
            Cole este valor no blog em <b>Configurações → Painel Central</b> (campo centralIngestSecret).
            Depois de fechar, não é possível vê-lo de novo — apenas gerar outro.
          </p>
          <button className="secondary" onClick={() => setSecret(null)}>Fechei e salvei no blog</button>
        </div>
      )}

      {!loading && list.length === 0 && !error && (
        <div className="tcard">
          <div className="tcard-empty">
            <Globe size={32} style={{ display: "block", margin: "0 auto" }} />
            <p>Nenhum blog cadastrado ainda. Clique em "Novo blog" para conectar o primeiro.</p>
          </div>
        </div>
      )}

      <div className={`blog-grid ${loading && list.length > 0 ? "is-stale" : ""}`}>
        {list.map((b) => {
          const color = nameColor(b.name);
          const cats = b.categories ?? [];
          return (
            <div className="blog-card" key={b.id}
              style={{ borderTop: `3px solid ${b.isActive ? color : "var(--border)"}` }}>
              <div className="bc-head">
                <div className="bc-avatar" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
                  {initials(b.name)}
                </div>
                <div className="bc-id">
                  <div className="bc-name">
                    {b.name}
                    {b.language === "en" && <span className="badge info">EN</span>}
                    {!b.isActive && <span className="badge err">inativo</span>}
                  </div>
                  <div className="bc-domain">
                    {b.domain ? (
                      <a href={`https://${b.domain.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer">
                        {b.domain} <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span className="mono" style={{ fontSize: 11 }}>{b.apiUrl}</span>
                    )}
                  </div>
                </div>
                <span className={`hp ${b.status === "online" ? "ok" : b.status === "error" ? "err" : "warn"}`}>
                  {statusLabel(b.status)}
                </span>
              </div>

              <div className="bc-meta">
                <div className="bc-kv">
                  <span><Radio size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Visto por último</span>
                  <b>{timeAgo(b.lastSeenAt)}</b>
                </div>
                <div className="bc-kv">
                  <span><Eye size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Modo de entrega</span>
                  <b>{b.deliveryMode === "draft" ? "Cria rascunho" : "Publica direto"}</b>
                </div>
                <div className="bc-kv">
                  <span><ShieldCheck size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Aprovação</span>
                  <b>{b.requireApproval ? "Manual" : "Automática"}</b>
                </div>
                <div className="bc-kv">
                  <span><Languages size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Idioma</span>
                  <b>{b.language === "en" ? "Inglês" : "Português (BR)"}</b>
                </div>
                <div className="bc-kv">
                  <span><Gauge size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Teto diário</span>
                  <b>{b.maxPostsPerDay != null ? `${fmtNum(b.maxPostsPerDay)} posts/dia` : "sem limite"}</b>
                </div>
                <div className="bc-kv">
                  <span><Timer size={9} style={{ verticalAlign: "-0.5px", marginRight: 3 }} />Intervalo mínimo</span>
                  <b>{b.minMinutesBetweenPosts != null ? `${fmtNum(b.minMinutesBetweenPosts)} min` : "—"}</b>
                </div>
              </div>

              {cats.length > 0 && (
                <div className="bc-cats" title={cats.map((c) => c.slug).join(", ")}>
                  {cats.slice(0, 6).map((c) => <span className="chip" key={c.slug}>{c.slug}</span>)}
                  {cats.length > 6 && <span className="chip">+{cats.length - 6}</span>}
                </div>
              )}

              {b.lastError && <div className="bc-err" title={b.lastError}>{b.lastError.slice(0, 140)}</div>}

              <div className="bc-actions">
                <button className="secondary small" onClick={() => void test(b)}>
                  <PlugZap size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Testar
                </button>
                <button className="secondary small" title="Enviar ao blog as fontes que as regras dele casam (tudo inativo lá)"
                  onClick={() => void syncSources(b)}>
                  <Rss size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Fontes
                </button>
                <button className="secondary small" onClick={() => openEdit(b)}>
                  <Pencil size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Editar
                </button>
                <div className="spacer" />
                <button className="iconbtn amber" title="Rotacionar segredo de integração" aria-label="Rotacionar segredo" onClick={() => void rotate(b)}>
                  <KeyRound size={15} />
                </button>
                <button className="iconbtn red" title="Remover blog" aria-label="Remover blog" onClick={() => void remove(b)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.id ? `Editar: ${editing.name}` : "Novo blog"}</h2>
            {editing.id && (
              <div className="seg" style={{ marginBottom: 12 }}>
                <button className={modalTab === "geral" ? "active" : ""} onClick={() => setModalTab("geral")}>
                  Geral
                </button>
                <button className={modalTab === "social" ? "active" : ""} onClick={() => setModalTab("social")}>
                  <Share2 size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />Redes Sociais
                </button>
              </div>
            )}
            {editing.id && modalTab === "social" ? (
              <BlogSocialTab blogId={editing.id} />
            ) : (
            <>
            {msg && <div className="error-box">{msg}</div>}
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>Domínio (informativo)</label>
            <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="blog-do-cliente.com.br" />
            <label>URL da API (base, terminando em /api)</label>
            <input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://blog-do-cliente.com.br/api" />
            <div className="row">
              <div>
                <label>Modo de entrega</label>
                <select value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value })}>
                  <option value="publish">Publicar direto</option>
                  <option value="draft">Criar como rascunho</option>
                </select>
              </div>
              <div>
                <label>Idioma do blog</label>
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">Inglês</option>
                </select>
              </div>
              <div>
                <label>Título das postagens</label>
                <select value={form.titleCase} onChange={(e) => setForm({ ...form, titleCase: e.target.value })}>
                  <option value="original">Como gerado pela IA</option>
                  <option value="upper">MAIÚSCULAS (caixa alta)</option>
                  <option value="sentence">Caixa normal (conserta título gritado)</option>
                </select>
              </div>
              <div>
                <label>Máx. posts/dia (vazio = sem limite)</label>
                <input type="number" value={form.maxPostsPerDay} onChange={(e) => setForm({ ...form, maxPostsPerDay: e.target.value })} />
              </div>
              <div>
                <label>Intervalo mín. entre posts (min)</label>
                <input type="number" value={form.minMinutesBetweenPosts} onChange={(e) => setForm({ ...form, minMinutesBetweenPosts: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.requireApproval} onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })} />
                Exigir aprovação manual antes de enviar
              </label>
              <label className="fit row" style={{ margin: 0 }}>
                <input className="fit" style={{ width: "auto" }} type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Ativo
              </label>
            </div>
            <label>
              Categorias do blog (uma por linha, "slug: dica para a IA"; vazio = sem classificação)
            </label>
            <textarea
              rows={6}
              value={form.categoriesText}
              onChange={(e) => setForm({ ...form, categoriesText: e.target.value })}
              placeholder={"football: club & international soccer\nnfl: american football\nothers: tudo que não couber acima"}
            />
            <p className="muted" style={{ marginTop: 4 }}>
              Com categorias definidas, a IA classifica cada entrega dentro DESTA lista (a home do
              blog popula nas seções certas). Regra com categoria explícita sempre vence; indecisão
              cai em "others" (ou no último slug).{" "}
              <button type="button" className="secondary small"
                onClick={() => setForm({ ...form, categoriesText: KSPORTS_CATEGORIES_TEXT })}>
                Preencher com o menu do KSports
              </button>
            </p>
            <label>Notas</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              <button onClick={save} disabled={busy || !form.name || !form.apiUrl}>
                {editing.id ? "Salvar" : "Criar e gerar segredo"}
              </button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
