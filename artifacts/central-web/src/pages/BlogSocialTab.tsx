import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Instagram, Link2, Loader2, Music2, Unplug } from "lucide-react";
import { api } from "../api";
import { useLoad } from "../hooks";

/** Aba "Redes Sociais" do modal de blog: conexão Meta (OAuth) + Buffer/TikTok. */

interface Connection {
  blogId: string;
  hasMeta: boolean;
  metaPageName: string | null;
  igUsername: string | null;
  metaLastError: string | null;
  bufferChannelId: string | null;
  bufferChannelName: string | null;
  hasBufferKey: boolean;
  hasGlobalBufferKey: boolean;
  metaAppId: string | null;
  hasMetaAppSecret: boolean;
  hasGlobalMetaApp: boolean;
}

interface MetaApp {
  appId: string;
  hasSecret: boolean;
  redirectUri: string;
}

interface OAuthPage {
  id: string;
  name: string;
  instagramId: string | null;
  instagramName: string | null;
}

export default function BlogSocialTab({ blogId }: { blogId: string }) {
  const { data: conn, reload } = useLoad(() => api<Connection>(`/social/connections/${blogId}`), [blogId]);
  const { data: app, reload: reloadApp } = useLoad(
    () => api<MetaApp>(`/social/meta/app?blogId=${encodeURIComponent(blogId)}`), [blogId],
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [pages, setPages] = useState<{ sessionId: string; list: OAuthPage[] } | null>(null);
  const [pageId, setPageId] = useState("");

  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");

  const [bufChannel, setBufChannel] = useState("");
  const [bufName, setBufName] = useState("");
  const [bufKey, setBufKey] = useState("");

  // Preenche os forms quando a conexão carrega
  useEffect(() => {
    setMetaAppId(conn?.metaAppId ?? "");
    setMetaAppSecret("");
    setBufChannel(conn?.bufferChannelId ?? "");
    setBufName(conn?.bufferChannelName ?? "");
    setBufKey("");
  }, [conn]);

  // Listener do popup OAuth (meta-auth-complete.html → postMessage)
  const oauthPending = useRef(false);
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; code?: string; state?: string; error?: string };
      if (data?.source !== "meta-oauth" || !oauthPending.current) return;
      oauthPending.current = false;
      if (data.error || !data.code) {
        setMsg(`Autorização recusada: ${data.error ?? "sem code"}`);
        setBusy(false);
        return;
      }
      try {
        const res = await api<{ sessionId: string; pages: OAuthPage[] }>("/social/meta/oauth/exchange", {
          method: "POST",
          body: { code: data.code, state: data.state },
        });
        if (res.pages.length === 0) {
          setMsg("Nenhuma Página do Facebook disponível nessa conta.");
        } else {
          setPages({ sessionId: res.sessionId, list: res.pages });
          const firstWithIg = res.pages.find((p) => p.instagramId);
          setPageId(firstWithIg?.id ?? "");
        }
      } catch (err) {
        setMsg(String((err as Error).message));
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connectMeta = async () => {
    setMsg(""); setOk("");
    setBusy(true);
    try {
      const res = await api<{ url: string }>(`/social/meta/oauth/start?blogId=${encodeURIComponent(blogId)}`);
      oauthPending.current = true;
      const popup = window.open(res.url, "meta-oauth", "width=600,height=720");
      if (!popup) {
        oauthPending.current = false;
        setMsg("Popup bloqueado pelo navegador — libere popups para este site.");
        setBusy(false);
      }
    } catch (err) {
      setMsg(String((err as Error).message));
      setBusy(false);
    }
  };

  const savePage = async () => {
    if (!pages || !pageId) return;
    setBusy(true); setMsg("");
    try {
      await api(`/social/meta/oauth/save`, { method: "POST", body: { sessionId: pages.sessionId, pageId } });
      setPages(null);
      setOk("Conta Meta conectada.");
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const disconnectMeta = async () => {
    if (!confirm("Desconectar a conta Meta deste blog? Os Reels param de sair até reconectar.")) return;
    await api(`/social/connections/${blogId}/meta`, { method: "DELETE" });
    setOk("Conta Meta desconectada.");
    reload();
  };

  const saveMetaApp = async () => {
    setBusy(true); setMsg(""); setOk("");
    try {
      await api(`/social/connections/${blogId}/meta-app`, {
        method: "PUT",
        body: { appId: metaAppId.trim(), appSecret: metaAppSecret.trim() || undefined },
      });
      setOk("App Meta do blog salvo.");
      setMetaAppSecret("");
      reload(); reloadApp();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const saveBuffer = async () => {
    setBusy(true); setMsg(""); setOk("");
    try {
      await api(`/social/connections/${blogId}/buffer`, {
        method: "PUT",
        body: {
          channelId: bufChannel.trim(),
          channelName: bufName.trim() || undefined,
          apiKey: bufKey.trim() || undefined,
        },
      });
      setOk("Buffer/TikTok salvo.");
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const disconnectBuffer = async () => {
    if (!confirm("Desconectar o TikTok (Buffer) deste blog?")) return;
    await api(`/social/connections/${blogId}/buffer`, { method: "DELETE" });
    setOk("Buffer/TikTok desconectado.");
    reload();
  };

  const appReady = !!app?.appId && !!app?.hasSecret;

  return (
    <>
      {msg && <div className="error-box">{msg}</div>}
      {ok && <div className="card" role="status" style={{ padding: "10px 14px" }}>✔ {ok}</div>}

      <div className="card" style={{ marginTop: 4 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Instagram size={16} /> Instagram (Meta — Reels)
        </h3>

        <label>App ID da Meta (deste blog)</label>
        <input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)}
          placeholder={conn?.hasGlobalMetaApp ? "vazio = usa o app global (legado)" : "ID do app no Meta for Developers"} />
        <label>
          App Secret da Meta
          {conn?.hasMetaAppSecret && <span className="muted"> — já salvo (••••), preencha para trocar</span>}
        </label>
        <input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)}
          placeholder={conn?.hasMetaAppSecret ? "••••••••" : "cole o App Secret"} />
        {app?.redirectUri && (
          <p className="muted" style={{ fontSize: 12 }}>
            Registre esta redirect URI no app (Facebook Login → Valid OAuth Redirect URIs):{" "}
            <code className="mono">{app.redirectUri}</code>
          </p>
        )}
        <div className="row" style={{ margin: "6px 0 14px" }}>
          <button className="secondary" disabled={busy || !metaAppId.trim()} onClick={() => void saveMetaApp()}>
            Salvar app
          </button>
        </div>

        {!appReady && (
          <p className="muted" style={{ marginTop: 0 }}>
            Salve o <b>App ID/Secret da Meta</b> acima (e registre a redirect URI no app)
            para liberar a conexão.
          </p>
        )}
        {conn?.hasMeta ? (
          <>
            <p style={{ margin: "4px 0" }}>
              <CheckCircle2 size={14} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--green, #16a34a)" }} />
              Conectado: <b>{conn.metaPageName}</b>
              {conn.igUsername && <> · <b>@{conn.igUsername}</b></>}
            </p>
            {conn.metaLastError && (
              <div className="error-box">
                Problema na conta: {conn.metaLastError} — reconecte abaixo.
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" disabled={busy || !appReady} onClick={() => void connectMeta()}>
                <Link2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Reconectar
              </button>
              <button className="secondary" onClick={() => void disconnectMeta()}>
                <Unplug size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Desconectar
              </button>
            </div>
          </>
        ) : pages ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Escolha a Página do Facebook (precisa ter Instagram Business vinculado):
            </p>
            {pages.list.map((p) => (
              <label key={p.id} className="row" style={{ margin: "4px 0", opacity: p.instagramId ? 1 : 0.5 }}>
                <input className="fit" style={{ width: "auto" }} type="radio" name="meta-page"
                  disabled={!p.instagramId} checked={pageId === p.id} onChange={() => setPageId(p.id)} />
                <span>
                  {p.name}
                  {p.instagramName
                    ? <span className="muted"> · IG @{p.instagramName}</span>
                    : <span className="muted"> · sem Instagram Business</span>}
                </span>
              </label>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <button disabled={busy || !pageId} onClick={() => void savePage()}>Salvar conexão</button>
              <button className="secondary" onClick={() => setPages(null)}>Cancelar</button>
            </div>
          </>
        ) : (
          <button disabled={busy || !appReady} onClick={() => void connectMeta()}>
            {busy
              ? <Loader2 size={14} className="spin-anim" style={{ verticalAlign: "-2px", marginRight: 6 }} />
              : <Link2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />}
            Conectar com a Meta
          </button>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Music2 size={16} /> TikTok (via Buffer)
        </h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Conecte o TikTok no painel do Buffer e cole aqui o <b>Channel ID</b> do canal.
        </p>
        <label>Channel ID do TikTok no Buffer *</label>
        <input value={bufChannel} onChange={(e) => setBufChannel(e.target.value)} placeholder="ex.: 64f1a2b3c4d5e6f7a8b9c0d1" />
        <label>Nome do canal (informativo)</label>
        <input value={bufName} onChange={(e) => setBufName(e.target.value)} placeholder="@conta_tiktok" />
        <label>
          API key do Buffer (deste blog)
          {conn?.hasBufferKey && <span className="muted"> — já salva (••••), preencha para trocar</span>}
        </label>
        <input type="password" value={bufKey} onChange={(e) => setBufKey(e.target.value)}
          placeholder={conn?.hasGlobalBufferKey ? "vazio = usa a chave global das Configurações" : "cole a API key (ou defina a global nas Configurações)"} />
        <div className="row" style={{ marginTop: 10 }}>
          <button disabled={busy || !bufChannel.trim()} onClick={() => void saveBuffer()}>Salvar</button>
          {conn?.bufferChannelId && (
            <button className="secondary" onClick={() => void disconnectBuffer()}>
              <Unplug size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />Desconectar
            </button>
          )}
        </div>
      </div>
    </>
  );
}
