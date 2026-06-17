import React, { useRef, useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi } from "../../lib/adminApi";
import { invalidateSiteCache } from "../../hooks/useSite";
import { Upload, CheckCircle, AlertCircle, Minus, Plus, Image } from "lucide-react";

export default function LogoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentLogo, setCurrentLogo] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(101);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const CARD = { background: "#FFFFFF", borderRadius: "16px", boxShadow: "0 8px 24px rgba(15,23,42,0.06)" };
  const PRIMARY = "#0B2A66";

  useEffect(() => {
    adminApi.getSettings().then((r) => {
      if (r.settings.logoBase64) setCurrentLogo(r.settings.logoBase64);
      if (r.settings.logoSize) setLogoSize(r.settings.logoSize);
    }).catch(() => {});
  }, []);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => { setPreview(e.target?.result as string); setStatus("idle"); };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  async function handleUpload() {
    setSaving(true); setStatus("idle");
    try {
      if (preview) { await adminApi.uploadLogo(preview); setCurrentLogo(preview); }
      await adminApi.updateSettings({ logoSize });
      invalidateSiteCache();
      setStatus("success");
      setPreview(null);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const displayLogo = preview ?? currentLogo;

  return (
    <AdminLayout title="Logo do Site">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header card */}
        <div style={CARD} className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EEF2FF" }}>
              <Image size={18} style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Logo do Portal</h2>
              <p className="text-xs text-slate-500 mt-0.5">Arquivo PNG ou SVG com fundo transparente — exibido no cabeçalho do site</p>
            </div>
          </div>
        </div>

        {/* Upload card */}
        <div style={CARD} className="p-6 space-y-5">

          {/* Current logo */}
          {currentLogo && !preview && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Logo atual</p>
              <div className="border border-slate-100 rounded-2xl p-6 flex items-center justify-center bg-slate-50">
                <img src={currentLogo} alt="Logo atual" style={{ height: logoSize }} className="w-auto object-contain" />
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
            style={{ "--hover-border": PRIMARY } as React.CSSProperties}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = PRIMARY)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#F7F9FC" }}>
              <Upload size={22} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              Clique ou arraste um arquivo aqui<br />
              <span className="text-xs text-slate-400">PNG, SVG, WEBP — recomendado fundo transparente</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pré-visualização</p>
              <div className="border border-slate-100 rounded-2xl p-6 flex items-center justify-center bg-slate-50">
                <img src={preview} alt="logo preview" style={{ height: logoSize }} className="w-auto object-contain" />
              </div>
            </div>
          )}

          {/* Size control */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tamanho da logo</p>
              <span className="text-sm font-bold" style={{ color: PRIMARY }}>{logoSize}px</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLogoSize((s) => Math.max(40, s - 8))}
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Minus size={14} />
              </button>
              <input
                type="range" min={40} max={200} step={4} value={logoSize}
                onChange={(e) => setLogoSize(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: PRIMARY }}
              />
              <button
                type="button"
                onClick={() => setLogoSize((s) => Math.min(200, s + 8))}
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            {displayLogo && (
              <div className="mt-3 border border-slate-100 rounded-2xl p-4 flex items-center justify-center overflow-hidden bg-slate-50">
                <img src={displayLogo} alt="size preview" style={{ height: logoSize, transition: "height 0.15s" }} className="w-auto object-contain" />
              </div>
            )}
          </div>

          {/* Status */}
          {status === "success" && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              <CheckCircle size={16} /> Logo e tamanho atualizados com sucesso!
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} /> Erro ao salvar
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={(!preview && status !== "idle") || saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: saving ? "#0B2A66" : "#0B2A66" }}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = "#0a2255"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0B2A66"; }}
          >
            <Upload size={16} /> {saving ? "Salvando..." : "Salvar Logo"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
