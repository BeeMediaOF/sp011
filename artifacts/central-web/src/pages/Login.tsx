import { useState } from "react";
import { Radio } from "lucide-react";
import { api, setToken } from "../api";
import { setStoredUser } from "../user";

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
      const res = await api<{ token: string; user?: { name?: string; email?: string; role?: string } }>(
        "/auth/login",
        { method: "POST", body: { email, password } },
      );
      setToken(res.token);
      setStoredUser(res.user ?? { email });
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
      <div>
        <div className="login-brand"><Radio size={26} /> Painel Central</div>
        <form className="login-card" onSubmit={submit}>
          <h2>Bem-vindo</h2>
          <p className="muted">Coleta, reescrita e distribuição de notícias.</p>
          {error && <div className="error-box">{error}</div>}
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
