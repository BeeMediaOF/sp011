import { useState } from "react";
import { api, setToken } from "../api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      onLogin();
      window.location.href = "/";
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>Painel Central</h2>
        <p className="muted">Coleta, reescrita e distribuição de notícias.</p>
        {error && <div className="error-box">{error}</div>}
        <label>E-mail</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label>Senha</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
