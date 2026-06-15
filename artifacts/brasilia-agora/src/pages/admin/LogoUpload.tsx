import React, { useRef, useState, useEffect } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi } from "../../lib/adminApi";
import { Upload, CheckCircle, AlertCircle, Minus, Plus } from "lucide-react";

export default function LogoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentLogo, setCurrentLogo] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(101);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    adminApi.getSettings().then((r) => {
      if (r.settings.logoBase64) setCurrentLogo(r.settings.logoBase64);
      if (r.settings.logoSize) setLogoSize(r.settings.logoSize);
    }).catch(() => {});
  }, []);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setStatus("idle");
    };
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
      if (preview) {
        await adminApi.uploadLogo(preview);
        setCurrentLogo(preview);
      }
      await adminApi.updateSettings({ logoSize });
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
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">

          {/* Current logo */}
          {currentLogo && !preview && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Logo atual</p>
              <div className="bg-white border rounded-lg p-4 flex items-center justify-center">
                <img src={currentLogo} alt="Logo atual" style={{ height: logoSize }} className="w-auto object-contain" />
              </div>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-600">
              Faça upload de um arquivo PNG ou SVG com fundo transparente. A logo será exibida no cabeçalho do site.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#1a2448] hover:bg-gray-50 transition-colors"
          >
            <Upload size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500 text-center">
              Clique ou arraste um arquivo aqui<br />
              <span className="text-xs text-gray-400">PNG, SVG, WEBP — recomendado fundo transparente</span>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pré-visualização</p>
              <div className="bg-white border rounded-lg p-4 flex items-center justify-center">
                <img src={preview} alt="logo preview" style={{ height: logoSize }} className="w-auto object-contain" />
              </div>
            </div>
          )}

          {/* Size control */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamanho da logo</p>
              <span className="text-sm font-bold text-[#1a2448]">{logoSize}px</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLogoSize((s) => Math.max(40, s - 8))}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Minus size={14} />
              </button>
              <input
                type="range"
                min={40}
                max={200}
                step={4}
                value={logoSize}
                onChange={(e) => setLogoSize(Number(e.target.value))}
                className="flex-1 accent-[#1a2448]"
              />
              <button
                type="button"
                onClick={() => setLogoSize((s) => Math.min(200, s + 8))}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            {/* Live preview of size with current/new logo */}
            {displayLogo && (
              <div className="mt-3 bg-white border rounded-lg p-3 flex items-center justify-center overflow-hidden">
                <img
                  src={displayLogo}
                  alt="size preview"
                  style={{ height: logoSize, transition: "height 0.15s" }}
                  className="w-auto object-contain"
                />
              </div>
            )}
          </div>

          {/* Status */}
          {status === "success" && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-sm">
              <CheckCircle size={16} /> Logo e tamanho atualizados com sucesso!
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
              <AlertCircle size={16} /> Erro ao salvar
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={(!preview && status !== "idle") || saving}
            className="w-full flex items-center justify-center gap-2 bg-[#1a2448] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors disabled:opacity-40"
          >
            <Upload size={16} /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
