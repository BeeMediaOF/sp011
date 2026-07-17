import { api } from "../api";
import { useLoad } from "../hooks";

/** Dashboard Qualidade IA (F6 dos PRDs 01–05) — consome GET /stats/quality. */

interface FailReason { reason: string | null; n: number }
interface Rewrites7d {
  total: number; avgScore: number | null; avgCoverage: number | null;
  withInvented: number; avgDurationMs: number | null;
}
interface ScoreBucket { bucket: number; n: number }
interface AuditRow { status: string | null; n: number }
interface AiCallRow { provider: string; purpose: string; calls: number; errors: number; avgDurationMs: number | null }
interface ProblemSource {
  sourceName: string; total: number; failed: number; failPct: number;
  thinSource: number; offTopic: number; shortContent: number;
}
interface QualityData {
  failReasons7d: FailReason[];
  failReasons30d: FailReason[];
  rewrites7d: Rewrites7d | null;
  scoreBuckets7d: ScoreBucket[];
  audits30d: AuditRow[];
  aiCalls7d: AiCallRow[];
  problemSources30d: ProblemSource[];
}

const BUCKET_LABELS = ["0–19", "20–39", "40–59", "60–79", "80–100"];
const AUDIT_LABELS: Record<string, string> = {
  pending: "aguardando auditoria",
  passed: "aprovadas",
  flagged: "sinalizadas p/ revisão",
  rejected: "reprovadas (invenção)",
};

export default function Quality() {
  const { data, error, reload } = useLoad(() => api<QualityData>("/stats/quality"));

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <p className="muted">Carregando…</p>;

  const rw = data.rewrites7d;
  const auditOf = (s: string) => data.audits30d.find((a) => a.status === s)?.n ?? 0;

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      <div className="grid">
        <div className="stat"><div className="n">{rw?.avgScore ?? "—"}</div><div className="l">score médio (7d)</div></div>
        <div className="stat"><div className="n">{rw?.avgCoverage != null ? `${rw.avgCoverage}%` : "—"}</div><div className="l">cobertura da fonte (7d)</div></div>
        <div className="stat"><div className="n">{rw?.withInvented ?? 0}</div><div className="l">reescritas c/ nº sem fonte (7d)</div></div>
        <div className="stat"><div className="n">{rw?.avgDurationMs != null ? `${Math.round(rw.avgDurationMs / 1000)}s` : "—"}</div><div className="l">tempo médio de reescrita (7d)</div></div>
      </div>

      <div className="card">
        <h3>Auditoria IA (30 dias)</h3>
        <div className="grid">
          <div className="stat"><div className="n">{auditOf("passed")}</div><div className="l">aprovadas</div></div>
          <div className="stat"><div className="n">{auditOf("flagged")}</div><div className="l">sinalizadas p/ revisão</div></div>
          <div className="stat"><div className="n">{auditOf("rejected")}</div><div className="l">reprovadas (invenção)</div></div>
          <div className="stat"><div className="n">{auditOf("pending")}</div><div className="l">na fila</div></div>
        </div>
        {data.audits30d.length === 0 && <p className="muted">Nenhuma auditoria ainda (ligue a IA Auditora nas Configurações depois da calibração).</p>}
      </div>

      <div className="card">
        <h3>Distribuição do score (7 dias)</h3>
        <table>
          <thead><tr><th>Faixa</th><th>Reescritas</th></tr></thead>
          <tbody>
            {[4, 3, 2, 1, 0].map((b) => (
              <tr key={b}>
                <td>{BUCKET_LABELS[b]}</td>
                <td>{data.scoreBuckets7d.find((s) => s.bucket === b)?.n ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Falhas por motivo</h3>
        <table>
          <thead><tr><th>Motivo</th><th>7 dias</th><th>30 dias</th></tr></thead>
          <tbody>
            {data.failReasons30d.map((r) => (
              <tr key={r.reason ?? "(sem motivo)"}>
                <td>{r.reason ?? "(sem motivo)"}</td>
                <td>{data.failReasons7d.find((x) => x.reason === r.reason)?.n ?? 0}</td>
                <td>{r.n}</td>
              </tr>
            ))}
            {data.failReasons30d.length === 0 && <tr><td colSpan={3} className="muted">Nenhuma falha registrada. 🎉</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Fontes problemáticas (30 dias) — detector de scrape quebrado</h3>
        <p className="muted">
          Fonte com muita "fonte rasa"/"fora do tema" costuma ser scrape quebrado ou feed sem
          descrição: vale conferir o endpoint na aba Fontes antes de culpar a IA.
        </p>
        <table>
          <thead><tr><th>Fonte</th><th>Coletadas</th><th>Falhas</th><th>% falha</th><th>Fonte rasa</th><th>Fora do tema</th><th>Curtas</th></tr></thead>
          <tbody>
            {data.problemSources30d.map((p) => (
              <tr key={p.sourceName}>
                <td>{p.sourceName}</td>
                <td>{p.total}</td>
                <td>{p.failed}</td>
                <td>{p.failPct}%</td>
                <td>{p.thinSource}</td>
                <td>{p.offTopic}</td>
                <td>{p.shortContent}</td>
              </tr>
            ))}
            {data.problemSources30d.length === 0 && <tr><td colSpan={7} className="muted">Nenhuma fonte com falhas no período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Chamadas de IA por provider/propósito (7 dias)</h3>
        <table>
          <thead><tr><th>Provider</th><th>Propósito</th><th>Chamadas</th><th>Erros</th><th>% erro</th><th>Duração média</th></tr></thead>
          <tbody>
            {data.aiCalls7d.map((c, i) => (
              <tr key={i}>
                <td>{c.provider}</td>
                <td>{c.purpose}</td>
                <td>{c.calls.toLocaleString("pt-BR")}</td>
                <td>{c.errors.toLocaleString("pt-BR")}</td>
                <td>{c.calls > 0 ? Math.round((c.errors / c.calls) * 100) : 0}%</td>
                <td>{c.avgDurationMs != null ? `${(c.avgDurationMs / 1000).toFixed(1)}s` : "—"}</td>
              </tr>
            ))}
            {data.aiCalls7d.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma chamada registrada no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
