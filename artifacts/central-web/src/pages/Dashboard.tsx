import { api } from "../api";
import { useLoad } from "../hooks";

interface Stats {
  news: Record<string, number>;
  deliveries: Record<string, number>;
  blogs: Record<string, number>;
  usageToday: { calls: number; totalTokens: number };
}

export default function Dashboard() {
  const { data, error, loading, reload } = useLoad(() => api<Stats>("/stats"));

  if (loading) return <p className="muted">Carregando…</p>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return null;

  const n = data.news;
  const d = data.deliveries;
  const b = data.blogs;

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      <h3 className="muted">Notícias</h3>
      <div className="grid">
        <Stat n={n["queued"] ?? 0} l="na fila de reescrita" />
        <Stat n={n["rewriting"] ?? 0} l="reescrevendo agora" />
        <Stat n={n["rewritten"] ?? 0} l="prontas p/ distribuir" />
        <Stat n={n["distributed"] ?? 0} l="distribuídas" />
        <Stat n={n["failed"] ?? 0} l="falharam" warn />
      </div>

      <h3 className="muted">Entregas</h3>
      <div className="grid">
        <Stat n={d["awaiting_approval"] ?? 0} l="aguardando aprovação" warn />
        <Stat n={d["pending"] ?? 0} l="pendentes" />
        <Stat n={d["delivered"] ?? 0} l="entregues" />
        <Stat n={d["duplicate"] ?? 0} l="duplicadas no blog" />
        <Stat n={(d["dead"] ?? 0) + (d["failed"] ?? 0)} l="mortas/falhas" warn />
      </div>

      <h3 className="muted">Blogs e IA</h3>
      <div className="grid">
        <Stat n={b["online"] ?? 0} l="blogs online" />
        <Stat n={(b["error"] ?? 0) + (b["offline"] ?? 0)} l="blogs offline/erro" warn />
        <Stat n={data.usageToday.calls} l="chamadas de IA hoje" />
        <Stat n={data.usageToday.totalTokens} l="tokens hoje" />
      </div>
    </>
  );
}

function Stat({ n, l, warn }: { n: number; l: string; warn?: boolean }) {
  return (
    <div className="stat">
      <div className="n" style={warn && n > 0 ? { color: "var(--warn)" } : undefined}>{n.toLocaleString("pt-BR")}</div>
      <div className="l">{l}</div>
    </div>
  );
}
