import { api } from "../api";
import { useLoad } from "../hooks";

interface UsageDay { day: string; calls: number; inputTokens: number; outputTokens: number; totalTokens: number }
interface UsageProvider { provider: string; model: string | null; calls: number; totalTokens: number }
interface UsageData { today: UsageDay; byDay: UsageDay[]; byProvider: UsageProvider[] }

export default function Usage() {
  const { data, error, reload } = useLoad(() => api<UsageData>("/usage"));

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <p className="muted">Carregando…</p>;

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      <div className="grid">
        <div className="stat"><div className="n">{data.today.calls.toLocaleString("pt-BR")}</div><div className="l">chamadas hoje</div></div>
        <div className="stat"><div className="n">{data.today.inputTokens.toLocaleString("pt-BR")}</div><div className="l">tokens de entrada hoje</div></div>
        <div className="stat"><div className="n">{data.today.outputTokens.toLocaleString("pt-BR")}</div><div className="l">tokens de saída hoje</div></div>
        <div className="stat"><div className="n">{data.today.totalTokens.toLocaleString("pt-BR")}</div><div className="l">total hoje</div></div>
      </div>

      <div className="card">
        <h3>Por provider/modelo (30 dias)</h3>
        <table>
          <thead><tr><th>Provider</th><th>Modelo</th><th>Chamadas</th><th>Total de tokens</th></tr></thead>
          <tbody>
            {data.byProvider.map((p, i) => (
              <tr key={i}>
                <td>{p.provider}</td><td>{p.model ?? "—"}</td>
                <td>{p.calls.toLocaleString("pt-BR")}</td>
                <td>{p.totalTokens.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
            {data.byProvider.length === 0 && <tr><td colSpan={4} className="muted">Nenhuma chamada registrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Por dia (30 dias)</h3>
        <table>
          <thead><tr><th>Dia</th><th>Chamadas</th><th>Entrada</th><th>Saída</th><th>Total</th></tr></thead>
          <tbody>
            {data.byDay.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.calls.toLocaleString("pt-BR")}</td>
                <td>{d.inputTokens.toLocaleString("pt-BR")}</td>
                <td>{d.outputTokens.toLocaleString("pt-BR")}</td>
                <td>{d.totalTokens.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
