import React, { useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { adminApi } from "../../lib/adminApi";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function LogoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

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
    if (!preview) return;
    setSaving(true); setStatus("idle");
    try {
      await adminApi.uploadLogo(preview);
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Upload de Logo">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div>
            <p className="text-sm text-gray-600">
              Faça upload de um arquivo PNG ou SVG com fundo transparente. A logo será exibida no cabeçalho e rodapé do site.
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
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1a2448] rounded-lg p-4 flex items-center justify-center">
                  <img src={preview} alt="logo preview" className="h-16 w-auto object-contain" />
                </div>
                <div className="bg-white border rounded-lg p-4 flex items-center justify-center">
                  <img src={preview} alt="logo preview" className="h-16 w-auto object-contain" />
                </div>
              </div>
              <div className="flex gap-2 items-center justify-between text-xs text-gray-400">
                <span>Fundo escuro (header)</span>
                <span>Fundo claro</span>
              </div>
            </div>
          )}

          {/* Status */}
          {status === "success" && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 text-sm">
              <CheckCircle size={16} /> Logo atualizada com sucesso!
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2.5 text-sm">
              <AlertCircle size={16} /> Erro ao salvar a logo
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!preview || saving}
            className="w-full flex items-center justify-center gap-2 bg-[#1a2448] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#243060] transition-colors disabled:opacity-40"
          >
            <Upload size={16} /> {saving ? "Enviando..." : "Salvar Logo"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
