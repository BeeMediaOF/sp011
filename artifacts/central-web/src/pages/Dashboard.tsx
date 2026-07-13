import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Inbox, PenLine, Clock, Send, AlertTriangle, ClipboardCheck, CheckCircle2,
  Gauge, Timer, Globe2, Bot, Coins, DollarSign, Copy, Radio,
  TrendingUp, TrendingDown, Minus, RefreshCw, Activity, XCircle, Info,
  Database, Server, HeartPulse, Newspaper,
} from "lucide-react";
import { api } from "../api";
import { statusLabel, timeAgo } from "../hooks";
import { TrendChart, BarChart, Donut, Sparkline, fmtNum, fmtCompact, type DayValue, type DonutSlice } from "../charts";

/* ── Tipos da resposta do /stats (a resposta só ganha chaves) ─────────────── */

interface Pair { today: number; yesterday: number }
interface PairN { today: number | null; yesterday: number | null }

interface SeriesPoint {
  day: string;
  collected: number; rewritten: number; delivered: number; failed: number;
  approved: number; duplicates: number; blogsReached: number;
  avgDeliveryMs: number | null;
  aiCalls: number; aiTokens: number; aiCostUsd: number;
}

interface BlogRow {
  id: string; name: string; domain: string | null; status: string;
  isActive: boolean; lastSeenAt: string | null; maxPostsPerDay: number | null;
  deliveredToday: number; successRate7d: number | null; spark: number[];
}

interface ActivityRow { ts: string; level: string; module: string; message: string }

interface Stats {
  news: Record<string, number>;
  deliveries: Record<string, number>;
  blogs: Record<string, number>;
  usageToday: { calls: number; totalTokens: number };
  cards: {
    collected: Pair; rewritten: Pair; delivered: Pair; failures: Pair;
    approved: Pair; duplicates: Pair; blogsReached: Pair;
    successRate: PairN; avgDeliveryMs: PairN; aiCalls: Pair; aiTokens: Pair; aiCostUsd: Pair;
  };
  series: SeriesPoint[];
  statusToday: Record<string, number>;
  blogsTable: BlogRow[];
  activity: ActivityRow[];
  health: {
    db: boolean; blogsOnline: number; blogsTotal: number;
    aiLastCallAt: number | null;
    workers: Record<string, number>;
    queue: { pending: number; awaitingApproval: number; awaitingLocalization: number; failed: number };
  };
  generatedAt: string;
}

/* ── Formatação ───────────────────────────────────────────────────────────── */

const fmtUsd = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });

const fmtMs = (n: number | null) =>
  n == null ? "—" : n < 1000 ? `${fmtNum(Math.round(n))} ms` : `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/* ── Delta hoje × ontem (cor = direção × se subir é bom) ──────────────────── */

function Delta({ pair, invert, unit }: { pair: PairN; invert?: boolean; unit?: "pct" | "pp" | "usd" | "ms" }) {
  const { today, yesterday } = pair;
  if (today == null || yesterday == null) return <span className="kpi-delta flat"><Minus size={11} /> sem base de ontem</span>;
  const diff = today - yesterday;
  if (diff === 0) return <span className="kpi-delta flat"><Minus size={11} /> = vs ontem</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  let txt: string;
  if (unit === "pp") txt = `${up ? "+" : "−"}${Math.abs(diff).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pp`;
  else if (unit === "usd") txt = `${up ? "+" : "−"}${fmtUsd(Math.abs(diff))}`;
  else if (unit === "ms") txt = `${up ? "+" : "−"}${fmtMs(Math.abs(diff))}`;
  else if (yesterday > 0) txt = `${up ? "+" : "−"}${Math.round((Math.abs(diff) / yesterday) * 100)}%`;
  else txt = `${up ? "+" : "−"}${fmtCompact(Math.abs(diff))}`;
  return (
    <span className={`kpi-delta ${good ? "up" : "down"}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {txt} vs ontem
    </span>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */

function Kpi({ icon: Icon, tone, value, label, children }: {
  icon: typeof Inbox; tone: string; value: string; label: string; children?: ReactNode;
}) {
  return (
    <div className="kpi">
      <div className={`kpi-icon ${tone}`}><Icon size={19} /></div>
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
        {children}
      </div>
    </div>
  );
}

/* ── Métrica do gráfico principal ─────────────────────────────────────────── */

const TREND_METRICS = {
  delivered: { label: "Entregues", color: "var(--info)" },
  collected: { label: "Coletadas", color: "var(--info)" },
  rewritten: { label: "Reescritas", color: "var(--info)" },
  failed: { label: "Falhas", color: "var(--err)" },
} as const;
type TrendMetric = keyof typeof TREND_METRICS;

const AI_METRICS = {
  aiTokens: { label: "Tokens", fmt: fmtCompact },
  aiCalls: { label: "Chamadas", fmt: fmtNum },
  aiCostUsd: { label: "Custo (US$)", fmt: fmtUsd },
} as const;
type AiMetric = keyof typeof AI_METRICS;

const MODULE_LABEL: Record<string, string> = {
  collector: "Coletor RSS", rewriter: "Reescrita IA", distributor: "Distribuidor",
  delivery: "Entregador", localizer: "Tradução/categoria", api: "API", auth: "Autenticação",
};

const AUTO_KEY = "central_dash_auto";

/* ── Página ───────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [metric, setMetric] = useState<TrendMetric>("delivered");
  const [aiMetric, setAiMetric] = useState<AiMetric>("aiTokens");
  const [auto, setAuto] = useState(() => {
    try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; }
  });

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await api<Stats>("/stats");
      setData(res);
      setError("");
      setUpdatedAt(new Date());
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try { localStorage.setItem(AUTO_KEY, auto ? "1" : "0"); } catch { /* ignore */ }
    if (!auto) return;
    const iv = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(iv);
  }, [auto, load]);

  if (!data && !error) {
    return <div className="tcard-loading"><div className="spinner" /><span className="muted">Carregando dashboard…</span></div>;
  }
  if (!data) return <div className="error-box">{error}</div>;

  const { cards: c, health: h } = data;
  const d = data.deliveries;
  const st = data.statusToday;
  const series = data.series.slice(-days);
  const trend: DayValue[] = series.map((p) => ({ day: p.day, value: p[metric] }));
  const aiBars: DayValue[] = series.map((p) => ({ day: p.day, value: p[aiMetric] }));
  const aiSum = (k: AiMetric) => series.reduce((s, p) => s + p[k], 0);

  const donutSlices: DonutSlice[] = [
    { key: "delivered", label: "Entregues", value: st["delivered"] ?? 0, color: "var(--ok)" },
    { key: "pending", label: "Pendentes", value: (st["pending"] ?? 0) + (st["delivering"] ?? 0), color: "var(--info)" },
    {
      key: "awaiting",
      label: "Aguardando",
      value: (st["awaiting_approval"] ?? 0) + (st["awaiting_localization"] ?? 0) + (st["localizing"] ?? 0),
      color: "var(--warn)",
    },
    { key: "failed", label: "Falhas", value: (st["failed"] ?? 0) + (st["dead"] ?? 0), color: "var(--err)" },
    { key: "duplicate", label: "Duplicadas", value: st["duplicate"] ?? 0, color: "#0891b2" },
    { key: "cancelled", label: "Canceladas", value: st["cancelled"] ?? 0, color: "var(--faint)" },
  ];

  const pendingNow = (d["pending"] ?? 0) + (d["delivering"] ?? 0);
  const awaitingNow = d["awaiting_approval"] ?? 0;
  const aiIdleH = h.aiLastCallAt ? (Date.now() - h.aiLastCallAt) / 3_600_000 : null;
  const workers = Object.entries(h.workers)
    .filter(([m]) => m in MODULE_LABEL && m !== "api" && m !== "auth")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      {/* Linha única de filtros/controles — vale para tudo abaixo */}
      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Período">
          <button className={days === 7 ? "active" : ""} onClick={() => setDays(7)}>7 dias</button>
          <button className={days === 30 ? "active" : ""} onClick={() => setDays(30)}>30 dias</button>
        </div>
        <label className="switch">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className="track" />
          Atualização automática
        </label>
        <div className="grow" />
        {updatedAt && <span className="upd-note">Atualizado {updatedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
        <button className="secondary small" onClick={() => void load()} disabled={fetching}>
          <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Atualizar
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className={fetching ? "is-stale" : ""}>
        <h3>Resumo geral</h3>
        <div className="kpi-grid">
          <Kpi icon={Inbox} tone="c-blue" value={fmtNum(c.collected.today)} label="Notícias recebidas hoje">
            <Delta pair={c.collected} />
          </Kpi>
          <Kpi icon={PenLine} tone="c-purple" value={fmtNum(c.rewritten.today)} label="Reescritas hoje">
            <Delta pair={c.rewritten} />
          </Kpi>
          <Kpi icon={Clock} tone="c-amber" value={fmtNum(pendingNow)} label="Pendentes de envio">
            <span className="kpi-delta flat">na fila agora</span>
          </Kpi>
          <Kpi icon={Send} tone="c-green" value={fmtNum(c.delivered.today)} label="Entregues hoje">
            <Delta pair={c.delivered} />
          </Kpi>
          <Kpi icon={AlertTriangle} tone="c-red" value={fmtNum(c.failures.today)} label="Falhas hoje">
            <Delta pair={c.failures} invert />
          </Kpi>
        </div>

        <h3>Entregas</h3>
        <div className="kpi-grid">
          <Kpi icon={ClipboardCheck} tone="c-amber" value={fmtNum(awaitingNow)} label="Aguardando aprovação">
            <span className="kpi-delta flat">na fila agora</span>
          </Kpi>
          <Kpi icon={CheckCircle2} tone="c-green" value={fmtNum(c.approved.today)} label="Aprovadas hoje">
            <Delta pair={c.approved} />
          </Kpi>
          <Kpi icon={Gauge} tone="c-blue" value={fmtPct(c.successRate.today)} label="Taxa de sucesso hoje">
            <Delta pair={c.successRate} unit="pp" />
          </Kpi>
          <Kpi icon={Timer} tone="c-purple" value={fmtMs(c.avgDeliveryMs.today)} label="Tempo médio de entrega">
            <Delta pair={c.avgDeliveryMs} invert unit="ms" />
          </Kpi>
          <Kpi icon={Globe2} tone="c-cyan" value={fmtNum(c.blogsReached.today)} label="Blogs alcançados hoje">
            <Delta pair={c.blogsReached} />
          </Kpi>
        </div>

        <h3>Blogs e IA</h3>
        <div className="kpi-grid">
          <Kpi icon={Radio} tone="c-green" value={`${h.blogsOnline}/${h.blogsTotal}`} label="Blogs online">
            {h.blogsTotal - h.blogsOnline > 0
              ? <span className="kpi-delta down"><AlertTriangle size={11} /> {h.blogsTotal - h.blogsOnline} offline/erro</span>
              : <span className="kpi-delta up"><CheckCircle2 size={11} /> todos no ar</span>}
          </Kpi>
          <Kpi icon={Bot} tone="c-purple" value={fmtNum(c.aiCalls.today)} label="Chamadas de IA hoje">
            <Delta pair={c.aiCalls} />
          </Kpi>
          <Kpi icon={Coins} tone="c-amber" value={fmtCompact(c.aiTokens.today)} label="Tokens usados hoje">
            <Delta pair={c.aiTokens} />
          </Kpi>
          <Kpi icon={DollarSign} tone="c-navy" value={fmtUsd(c.aiCostUsd.today)} label="Custo estimado hoje">
            <Delta pair={c.aiCostUsd} invert unit="usd" />
          </Kpi>
          <Kpi icon={Copy} tone="c-orange" value={fmtNum(c.duplicates.today)} label="Duplicadas hoje">
            <Delta pair={c.duplicates} invert />
          </Kpi>
        </div>

        {/* Evolução + status */}
        <div className="dash-grid" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Evolução diária</p>
                <p className="panel-sub">{TREND_METRICS[metric].label} por dia · últimos {days} dias</p>
              </div>
              <div className="grow" />
              <select className="panel-select" value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)} aria-label="Métrica do gráfico">
                {Object.entries(TREND_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <TrendChart points={trend} color={TREND_METRICS[metric].color} />
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Distribuição por status</p>
                <p className="panel-sub">entregas com atividade hoje</p>
              </div>
            </div>
            <Donut slices={donutSlices} centerLabel="hoje" />
          </div>
        </div>

        {/* Blogs conectados + atividade */}
        <div className="dash-grid">
          <div className="panel" style={{ paddingBottom: 8 }}>
            <div className="panel-head">
              <div>
                <p className="panel-title">Blogs conectados</p>
                <p className="panel-sub">entregas de hoje, sucesso e tendência de 7 dias</p>
              </div>
              <div className="grow" />
              <Link href="/blogs" className="muted" style={{ fontSize: 12 }}>Ver todos →</Link>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Blog</th><th>Status</th><th>Última comunicação</th>
                    <th>Hoje</th><th>Sucesso 7d</th><th>Tendência</th>
                  </tr>
                </thead>
                <tbody>
                  {data.blogsTable.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b style={{ color: "var(--text)" }}>{b.name}</b>
                        {!b.isActive && <span className="badge err" style={{ marginLeft: 6 }}>inativo</span>}
                        <div className="muted" style={{ fontSize: 11 }}>{b.domain ?? "—"}</div>
                      </td>
                      <td><span className={`hp ${b.status === "online" ? "ok" : b.status === "error" ? "err" : "warn"}`}>{statusLabel(b.status)}</span></td>
                      <td>{timeAgo(b.lastSeenAt)}</td>
                      <td>
                        <b style={{ color: "var(--text)" }}>{fmtNum(b.deliveredToday)}</b>
                        {b.maxPostsPerDay != null && <span className="muted"> / {fmtNum(b.maxPostsPerDay)}</span>}
                      </td>
                      <td>{fmtPct(b.successRate7d)}</td>
                      <td><Sparkline values={b.spark} /></td>
                    </tr>
                  ))}
                  {data.blogsTable.length === 0 && (
                    <tr><td colSpan={6} className="muted">Nenhum blog cadastrado ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Atividade recente</p>
                <p className="panel-sub">últimos eventos do pipeline</p>
              </div>
              <div className="grow" />
              <Link href="/logs" className="muted" style={{ fontSize: 12 }}>Ver tudo →</Link>
            </div>
            <div className="tl">
              {data.activity.map((a, i) => {
                const tone = a.level === "error" ? "err" : a.level === "warn" ? "warn" : "info";
                const Icon = a.level === "error" ? XCircle : a.level === "warn" ? AlertTriangle : Activity;
                return (
                  <div className="tl-item" key={i}>
                    <div className={`tl-ic ${tone}`}><Icon size={14} /></div>
                    <div className="tl-body">
                      <div className="tl-msg">{a.message}</div>
                      <div className="tl-meta">{MODULE_LABEL[a.module] ?? a.module} · {timeAgo(a.ts)}</div>
                    </div>
                  </div>
                );
              })}
              {data.activity.length === 0 && <p className="muted">Nenhum evento registrado ainda.</p>}
            </div>
          </div>
        </div>

        {/* Uso de IA + saúde */}
        <div className="dash-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Uso de IA</p>
                <p className="panel-sub">últimos {days} dias · custo estimado por tabela de preço dos provedores</p>
              </div>
              <div className="grow" />
              <select className="panel-select" value={aiMetric} onChange={(e) => setAiMetric(e.target.value as AiMetric)} aria-label="Métrica de IA">
                {Object.entries(AI_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="mini-stats">
              <div className="mini-stat"><b>{fmtNum(aiSum("aiCalls"))}</b><span>chamadas no período</span></div>
              <div className="mini-stat"><b>{fmtCompact(aiSum("aiTokens"))}</b><span>tokens no período</span></div>
              <div className="mini-stat"><b>{fmtUsd(aiSum("aiCostUsd"))}</b><span>custo estimado</span></div>
            </div>
            <BarChart points={aiBars} formatValue={AI_METRICS[aiMetric].fmt} />
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="panel-title">Saúde do sistema</p>
                <p className="panel-sub">estado dos componentes agora</p>
              </div>
            </div>
            <div className="health-list">
              <div className="health-item">
                <Server size={15} style={{ color: "var(--faint)" }} />
                <span className="hi-label">API central</span>
                <span className="hp ok">Online</span>
              </div>
              <div className="health-item">
                <Database size={15} style={{ color: "var(--faint)" }} />
                <span className="hi-label">Banco de dados</span>
                <span className="hp ok">Online</span>
              </div>
              <div className="health-item">
                <Radio size={15} style={{ color: "var(--faint)" }} />
                <span className="hi-label">Blogs conectados</span>
                <span className={`hp ${h.blogsTotal === 0 ? "muted" : h.blogsOnline === h.blogsTotal ? "ok" : h.blogsOnline === 0 ? "err" : "warn"}`}>
                  {h.blogsOnline}/{h.blogsTotal} online
                </span>
              </div>
              <div className="health-item">
                <Bot size={15} style={{ color: "var(--faint)" }} />
                <span className="hi-label">
                  IA
                  <small>{h.aiLastCallAt ? `última chamada ${timeAgo(h.aiLastCallAt)}` : "nenhuma chamada registrada"}</small>
                </span>
                <span className={`hp ${aiIdleH == null ? "muted" : aiIdleH <= 6 ? "ok" : "warn"}`}>
                  {aiIdleH == null ? "sem uso" : aiIdleH <= 6 ? "Ativa" : "Ociosa"}
                </span>
              </div>
              <div className="health-item">
                <HeartPulse size={15} style={{ color: "var(--faint)" }} />
                <span className="hi-label">
                  Fila de entregas
                  <small>
                    {fmtNum(h.queue.pending)} pendente(s) · {fmtNum(h.queue.awaitingApproval)} p/ aprovar
                    {h.queue.awaitingLocalization > 0 ? ` · ${fmtNum(h.queue.awaitingLocalization)} p/ traduzir` : ""}
                  </small>
                </span>
                <span className={`hp ${h.queue.failed > 0 ? "warn" : "ok"}`}>
                  {h.queue.failed > 0 ? `${fmtNum(h.queue.failed)} falhada(s)` : "Saudável"}
                </span>
              </div>
              {workers.map(([m, ts]) => (
                <div className="health-item" key={m}>
                  <Newspaper size={15} style={{ color: "var(--faint)" }} />
                  <span className="hi-label">{MODULE_LABEL[m] ?? m}</span>
                  <span className="hp muted">{timeAgo(ts)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 11, textAlign: "center", margin: "4px 0 8px" }}>
          <Info size={11} style={{ verticalAlign: "-1.5px", marginRight: 4 }} />
          Dia operacional no fuso de Brasília · custo de IA é estimativa por preço de tabela (Ollama local = US$ 0)
        </p>
      </div>
    </>
  );
}
