import { useState, useEffect } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "bee_analytics_consent";

export type ConsentState = "accepted" | "rejected" | null;

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch { /* ignore */ }
  return null;
}

export default function LGPDConsent() {
  const [visible, setVisible] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    if (getConsent() === null) {
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
    window.dispatchEvent(new Event("bee_consent_change"));
  }

  function reject() {
    localStorage.setItem(STORAGE_KEY, "rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] w-[320px] bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
      role="dialog"
      aria-label="Controle de privacidade"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[#c8102e] text-[14px]">Controle sua privacidade</span>
          <span className="text-xl">🦉</span>
        </div>
        <p className="text-[12px] text-gray-600 leading-relaxed">
          Nosso site usa cookies para melhorar a navegação e medir audiência, conforme a{" "}
          <strong>LGPD (Lei nº 13.709/2018)</strong>.
        </p>
        <div className="flex gap-2 mt-2 text-[11px]">
          <Link href="/privacidade" className="text-[#c8102e] underline hover:text-red-700">
            Política de Privacidade
          </Link>
          <span className="text-gray-300">–</span>
          <Link href="/termos" className="text-[#c8102e] underline hover:text-red-700">
            Termos de uso
          </Link>
        </div>
      </div>

      {/* Options (expandable) */}
      {showOptions && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Categorias</p>
          {[
            { label: "Essenciais", desc: "Necessários para o funcionamento do site", locked: true },
            { label: "Analytics", desc: "Audiência, páginas mais lidas, tempo de tela", locked: false },
            { label: "Publicidade", desc: "Anúncios relevantes e mapa de calor", locked: false },
          ].map(({ label, desc, locked }) => (
            <div key={label} className="flex items-start gap-2">
              <div className={`mt-0.5 w-8 h-4 rounded-full shrink-0 ${locked ? "bg-green-400" : "bg-gray-300"} relative`}>
                <span className={`absolute top-0.5 ${locked ? "right-0.5" : "left-0.5"} w-3 h-3 bg-white rounded-full shadow`} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-700">{label}{locked && " *"}</p>
                <p className="text-[10px] text-gray-400">{desc}</p>
              </div>
            </div>
          ))}
          <p className="text-[9px] text-gray-400">* Não pode ser desativado</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={() => setShowOptions(v => !v)}
          className="text-[11px] font-medium text-gray-500 underline hover:text-gray-700 transition-colors shrink-0"
        >
          Minhas opções
        </button>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={reject}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            Rejeitar
          </button>
          <button
            onClick={accept}
            className="px-4 py-1.5 text-[12px] font-bold bg-[#c8102e] hover:bg-red-700 text-white rounded transition-colors"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
