import { useState } from "react";
import { api } from "../api";
import { fmtDate, useLoad } from "../hooks";

interface LogRow {
  id: number;
  ts: string;
  level: string;
  module: string;
  message: string;
  refType: string | null;
  refId: string | null;
}

const MODULES = ["", "collector", "rewriter", "distributor", "delivery", "auth", "api"];

export default function Logs() {
  const [module_, setModule] = useState("");
  const [level, setLevel] = useState("");
  const { data: rows, error, reload } = useLoad(
    () => api<LogRow[]>(`/logs?limit=300${module_ ? `&module=${module_}` : ""}${level ? `&level=${level}` : ""}`),
    [module_, level],
  );

  return (
    <>
      <div className="toolbar">
        <div className="grow" />
        <select style={{ maxWidth: 170 }} value={module_} onChange={(e) => setModule(e.target.value)}>
          {MODULES.map((m) => <option key={m} value={m}>{m || "Todos os módulos"}</option>)}
        </select>
        <select style={{ maxWidth: 140 }} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Todos os níveis</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <button className="secondary small" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <table>
          <thead><tr><th>Quando</th><th>Módulo</th><th>Nível</th><th>Mensagem</th></tr></thead>
          <tbody>
            {(rows ?? []).map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(l.ts)}</td>
                <td><span className="badge">{l.module}</span></td>
                <td>
                  <span className={`badge ${l.level === "error" ? "err" : l.level === "warn" ? "warn" : "info"}`}>{l.level}</span>
                </td>
                <td>{l.message}</td>
              </tr>
            ))}
            {rows?.length === 0 && <tr><td colSpan={4} className="muted">Nenhum evento.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
