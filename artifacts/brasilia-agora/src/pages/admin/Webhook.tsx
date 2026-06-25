import React, { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Copy, CheckCheck, RefreshCw, Eye, EyeOff, Key, AlertTriangle } from "lucide-react";
import { adminApi } from "../../lib/adminApi";

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return { copied, copy };
}

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
        ${copied ? "bg-green-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
    >
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
      {copied ? "Copiado!" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative">
      {label && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>}
      <div className="bg-gray-900 rounded-xl p-4 pr-16 font-mono text-xs text-gray-100 whitespace-pre-wrap leading-relaxed overflow-x-auto">
        {code}
      </div>
      <div className="absolute top-8 right-3">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

export default function Webhook() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [error, setError] = useState("");

  const baseUrl = window.location.origin;
  const publishUrl = `${baseUrl}/api/publish`;

  useEffect(() => {
    adminApi.getWebhookKey()
      .then(({ apiKey: k }) => setApiKey(k))
      .catch(() => setError("Erro ao carregar chave de API"))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!confirmRegen) { setConfirmRegen(true); return; }
    setRegenerating(true); setError(""); setConfirmRegen(false);
    try {
      const { apiKey: newKey } = await adminApi.regenerateWebhookKey();
      setApiKey(newKey);
      setShowKey(true);
    } catch {
      setError("Erro ao regenerar chave de API");
    } finally {
      setRegenerating(false);
    }
  }

  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}${"•".repeat(24)}${apiKey.slice(-8)}` : "";
  const displayKey = showKey ? (apiKey ?? "") : maskedKey;

  const curlCreate = `curl -X POST "${publishUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey ?? "<sua-api-key>"}" \\
  -d '{
    "title": "Título do artigo",
    "subtitle": "Subtítulo ou lide do artigo",
    "content": "Texto completo do artigo aqui...",
    "category": "politica",
    "tag": "POLÍTICA",
    "imageUrl": "https://exemplo.com/imagem.jpg",
    "author": "Redação SBC Agora"
  }'`;

  const curlPublishId = `curl -X POST "${publishUrl}/<id-do-artigo>" \\
  -H "Authorization: Bearer ${apiKey ?? "<sua-api-key>"}"`;

  const bodySchema = `{
  "title":    string  // OBRIGATÓRIO — Título do artigo
  "subtitle": string  // opcional  — Subtítulo / lide
  "content":  string  // opcional  — Corpo do artigo
  "category": string  // opcional  — politica | cidade | seguranca |
                      //             transporte | saude | educacao |
                      //             cultura | esportes | colunas |
                      //             brasil | mundo | geral
  "tag":      string  // opcional  — Label exibida (ex: "POLÍTICA")
  "imageUrl": string  // opcional  — URL da imagem de capa
  "author":   string  // opcional  — Nome do autor
}`;

  const responseExample = `{
  "ok": true,
  "message": "Artigo criado e publicado com sucesso",
  "article": {
    "id": "uuid-gerado",
    "title": "Título do artigo",
    "status": "published",
    "publishedAt": "2026-05-26T14:00:00.000Z",
    ...
  }
}`;

  return (
    <AdminLayout title="Webhook de Publicação">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Overview */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Endpoint Principal</h2>
              <p className="text-xs text-gray-500 mt-0.5">Cria e publica um artigo em uma única requisição</p>
            </div>
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">POST</span>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-800">
            <span className="text-green-600 font-bold text-xs">POST</span>
            <span className="flex-1 truncate">{publishUrl}</span>
            <CopyButton text={publishUrl} />
          </div>

          <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-800">
            <span className="text-blue-600 font-bold text-xs">POST</span>
            <span className="flex-1 truncate">{publishUrl}/:id</span>
            <CopyButton text={`${publishUrl}/:id`} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5 ml-1">Segundo endpoint: publica um rascunho existente pelo ID</p>
        </div>

        {/* Permanent API Key */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-[#0B2A66]" />
            <h2 className="font-bold text-gray-800 text-base">Chave de API Permanente</h2>
            <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">Não expira</span>
          </div>

          <p className="text-sm text-gray-500">
            Use esta chave no header <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Authorization: Bearer &lt;chave&gt;</code> para integrar com Make, Zapier, n8n e outras plataformas. Diferente do token JWT, esta chave é permanente e não expira.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="w-4 h-4 border-2 border-[#0B2A66] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Carregando...</span>
            </div>
          ) : apiKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 font-mono text-sm">
                <span className="text-gray-500 text-xs">Bearer</span>
                <span className="text-[#0B2A66] font-semibold truncate flex-1 text-xs">{displayKey}</span>
                <button onClick={() => setShowKey(s => !s)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <CopyButton text={apiKey} label="Copiar chave" />
              </div>
              <p className="text-xs text-green-600 font-medium">✓ Chave ativa — use esta chave nas suas automações</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-700">Nenhuma chave gerada ainda. Clique em "Gerar Chave" abaixo para criar sua primeira API Key permanente.</p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Regenerate section */}
          <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-3">
            {confirmRegen ? (
              <>
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    <strong>Atenção:</strong> Ao regenerar, a chave atual será invalidada imediatamente. Todas as integrações existentes precisarão ser atualizadas com a nova chave.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmRegen(false)}
                    className="flex-1 border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={regenerating}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
                    {regenerating ? "Regenerando..." : "Confirmar Regeneração"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-600">{apiKey ? "Regenerar chave de API" : "Gerar chave de API"}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{apiKey ? "Invalida a chave atual e cria uma nova" : "Cria uma nova chave permanente para integrações"}</p>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 bg-[#0B2A66] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#0a2255] transition-colors disabled:opacity-60"
                >
                  <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
                  {apiKey ? "Regenerar Chave" : "Gerar Chave"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Schema */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-800 text-base">Body da Requisição (JSON)</h2>
          <CodeBlock code={bodySchema} />
        </div>

        {/* Examples */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-gray-800 text-base">Exemplos cURL</h2>

          <CodeBlock code={curlCreate} label="1. Criar e publicar artigo" />
          <CodeBlock code={curlPublishId} label="2. Publicar rascunho existente por ID" />
        </div>

        {/* Response */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-800 text-base">Resposta de Sucesso (201)</h2>
          <CodeBlock code={responseExample} />

          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { code: "201", label: "Artigo criado e publicado", color: "bg-green-100 text-green-700" },
              { code: "400", label: "Campo obrigatório ausente", color: "bg-yellow-100 text-yellow-700" },
              { code: "401", label: "Chave ausente ou inválida", color: "bg-red-100 text-red-700" },
            ].map(({ code, label, color }) => (
              <div key={code} className={`${color} rounded-lg px-3 py-2.5 text-center`}>
                <p className="font-bold text-lg">{code}</p>
                <p className="text-xs leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Make / Zapier / n8n */}
        <div className="bg-[#0B2A66] text-white rounded-2xl p-6 space-y-3">
          <h2 className="font-bold text-base">Integração com Make, Zapier, n8n</h2>
          <p className="text-sm text-white/70">Use o módulo <strong className="text-white">HTTP / Webhook</strong> da plataforma de automação:</p>
          <ol className="text-sm text-white/80 space-y-1 list-decimal list-inside">
            <li>URL: <code className="bg-white/10 px-1.5 rounded font-mono">{publishUrl}</code></li>
            <li>Método: <strong className="text-white">POST</strong></li>
            <li>Header: <code className="bg-white/10 px-1.5 rounded font-mono">Authorization: Bearer {"{"}api-key{"}"}</code></li>
            <li>Body: JSON com os campos acima</li>
          </ol>
          <p className="text-xs text-white/50 pt-1">Use a Chave de API Permanente acima — ela não expira e não precisa ser renovada.</p>
        </div>

      </div>
    </AdminLayout>
  );
}
